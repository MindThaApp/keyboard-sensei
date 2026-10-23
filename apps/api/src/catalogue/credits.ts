import { Router } from "express";
import { prisma } from "../db.js";
import { isCreditedLicence, licenceUrl, sharedSongWhere } from "./eligibility.js";

/** Public credits: no sign-in needed, so the licence page and store listing can link to it. */
export const creditsRouter: Router = Router();

/**
 * Every shared song this deployment serves under a Creative Commons licence, with the
 * credit line its licence requires (Song.attribution, written from the Essentials
 * manifest by the same code that builds the third-party licences page).
 * Public-domain songs need no credit and are not listed.
 */
creditsRouter.get("/credits", async (_req, res, next) => {
  try {
    const rows = await prisma.song.findMany({
      where: { ...sharedSongWhere(), retired_at: null, file_licence: { startsWith: "cc-" } },
      select: {
        id: true,
        title: true,
        artist: true,
        arrangement_level: true,
        file_licence: true,
        attribution: true,
        source_url: true,
      },
      orderBy: [{ artist: "asc" }, { title: "asc" }, { arrangement_level: "asc" }],
    });
    res.json({
      credits: rows
        .filter((row) => isCreditedLicence(row.file_licence))
        .map((row) => ({
          song_id: row.id,
          title: row.title,
          artist: row.artist,
          level: row.arrangement_level,
          licence: row.file_licence,
          licence_url: licenceUrl(row.file_licence),
          attribution: row.attribution,
          source_url: row.source_url,
        })),
    });
  } catch (e) {
    next(e);
  }
});
