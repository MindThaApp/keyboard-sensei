import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { Button, Card, SegmentedControl, useToast } from "../ui";
import AdminNav from "./AdminNav";
import { downloadLicenceCsv } from "./CatalogueApi";
import CatalogueAudit from "./CatalogueAudit";
import CatalogueQueue from "./CatalogueQueue";
import CatalogueSongs from "./CatalogueSongs";
import CatalogueWorks from "./CatalogueWorks";

type Tab = "songs" | "queue" | "works" | "audit" | "licences";

const TABS: { value: Tab; label: string }[] = [
  { value: "songs", label: "Songs" },
  { value: "queue", label: "Import queue" },
  { value: "works", label: "Works" },
  { value: "audit", label: "Audit" },
  { value: "licences", label: "Licences" },
];

function Licences() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadLicenceCsv();
    } catch (e) {
      toast.show({ tone: "error", title: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold text-label">Licence report</h2>
      <p className="text-sm text-label-2">
        Every shared song with its source, file licence and credit line, as a CSV. The songs marked as needing a credit are the ones the players see
        on the Credits screen (<code>/credits</code>).
      </p>
      <Button variant="filled" loading={busy} onClick={() => void download()}>Download CSV</Button>
    </Card>
  );
}

/** Settings → Library for admins: curate the catalogue. Phones get a read-only view. */
export default function CataloguePage() {
  const { device } = useDeviceClass();
  const readOnly = device === "phone";
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.some((entry) => entry.value === requested) ? (requested as Tab) : "songs";

  return (
    <div className="space-y-4">
      <AdminNav />
      <h1 className="glass-text font-display text-2xl font-semibold text-label">Catalogue</h1>
      <SegmentedControl
        aria-label="Catalogue sections"
        options={TABS}
        value={tab}
        onChange={(next) => setParams(next === "songs" ? {} : { tab: next }, { replace: true })}
      />
      {tab === "songs" && <CatalogueSongs readOnly={readOnly} />}
      {tab === "queue" && <CatalogueQueue readOnly={readOnly} />}
      {tab === "works" && <CatalogueWorks readOnly={readOnly} />}
      {tab === "audit" && <CatalogueAudit readOnly={readOnly} />}
      {tab === "licences" && <Licences />}
    </div>
  );
}
