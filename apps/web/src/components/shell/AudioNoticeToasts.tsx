import { useEffect } from "react";
import { dismissAudioNotice, useAudioNotices } from "../../audio/audioNotices";
import { useFocusMode } from "../../hooks/useFocusMode";
import { useToast } from "../ui/Toast";

/**
 * Audio problems (e.g. an instrument that failed to load) shown as info toasts. They
 * wait in the notice store while focus mode is on and appear when it ends.
 */
export default function AudioNoticeToasts() {
  const notices = useAudioNotices();
  const toast = useToast();
  const { active: focused } = useFocusMode();

  useEffect(() => {
    if (focused) return;
    for (const notice of notices) {
      dismissAudioNotice(notice.id);
      toast.show({ tone: "info", title: notice.message, duration: 7000 });
    }
  }, [notices, focused, toast]);

  return null;
}
