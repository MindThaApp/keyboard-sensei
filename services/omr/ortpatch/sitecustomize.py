"""Sizes ONNX Runtime's thread pools to the container's CPU limit (loaded only in the homr process).

homr creates its InferenceSessions with default options, so ONNX Runtime sizes its pools to the
host's cores and spin-waits, which a container CPU quota (CFS) punishes hard. This wraps
onnxruntime.InferenceSession, in our process only, so homr itself stays unmodified:
intra-op threads = the CPU limit, one inter-op thread, no spinning.

Env overrides: OMR_ORT_THREADS (int), OMR_ORT_SPIN (1 = allow spinning).
"""

import math
import os


def cpu_limit():
    try:
        with open("/sys/fs/cgroup/cpu.max") as handle:
            quota, period = handle.read().split()[:2]
        if quota != "max":
            return max(1, math.ceil(int(quota) / int(period)))
    except (OSError, ValueError):
        pass
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except (AttributeError, OSError):
        return max(1, os.cpu_count() or 1)


def install():
    import onnxruntime as ort

    threads = int(os.environ.get("OMR_ORT_THREADS") or cpu_limit())
    spin = os.environ.get("OMR_ORT_SPIN") == "1"
    original = ort.InferenceSession

    class InferenceSession(original):
        def __init__(self, path_or_bytes, sess_options=None, *args, **kwargs):
            if sess_options is None:
                sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = threads
            sess_options.inter_op_num_threads = 1
            if not spin:
                sess_options.add_session_config_entry("session.intra_op.allow_spinning", "0")
            super().__init__(path_or_bytes, sess_options, *args, **kwargs)

    ort.InferenceSession = InferenceSession


if os.environ.get("OMR_ORT_PATCH") == "1":
    try:
        install()
    except Exception as error:  # never stop homr over a tuning patch
        print(f"omr: ORT thread patch not applied: {error}", flush=True)
