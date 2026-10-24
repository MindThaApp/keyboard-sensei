// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadSong = vi.fn();
vi.mock("../../services/api", () => ({ downloadSong: (...args: unknown[]) => downloadSong(...args) }));

import SongDownloadButtons from "./SongDownloadButtons";

const song = (downloads?: Record<"midi" | "musicxml" | "mei", boolean>) => ({ id: "s1", title: "Aloha Oe", downloads });

describe("SongDownloadButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadSong.mockResolvedValue(undefined);
  });

  it("renders nothing when the server offers no download (or is older and sends none)", () => {
    const { container, rerender } = render(<SongDownloadButtons song={song({ midi: false, musicxml: false, mei: false })} />);
    expect(container.innerHTML).toBe("");
    rerender(<SongDownloadButtons song={song(undefined)} />);
    expect(container.innerHTML).toBe("");
  });

  it("offers MIDI only for a plain upload", () => {
    render(<SongDownloadButtons song={song({ midi: true, musicxml: false, mei: false })} />);
    expect(screen.getByRole("button", { name: "Download MIDI of Aloha Oe" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /MusicXML/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /MEI/ })).toBeNull();
  });

  it("offers MusicXML and MEI for a score import and downloads the clicked format", async () => {
    const user = userEvent.setup();
    render(<SongDownloadButtons song={song({ midi: true, musicxml: true, mei: true })} />);
    await user.click(screen.getByRole("button", { name: "Download MusicXML of Aloha Oe" }));
    await waitFor(() => expect(downloadSong).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), "musicxml"));
  });

  it("shows the server's refusal instead of failing silently", async () => {
    downloadSong.mockRejectedValue(new Error("This song can be played here but not downloaded"));
    const user = userEvent.setup();
    render(<SongDownloadButtons song={song({ midi: true, musicxml: false, mei: false })} />);
    await user.click(screen.getByRole("button", { name: "Download MIDI of Aloha Oe" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not downloaded");
  });
});
