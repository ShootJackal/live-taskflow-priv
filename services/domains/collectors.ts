import { Collector } from "@/types";
import { apiGet, apiMetaPost } from "@/services/http/gasClient";
import { normalizeCollectorName } from "@/utils/normalize";

const SF_COLLECTOR_NAMES = new Set(["travis", "tony", "veronika"]);

interface RawCollector {
  name: string;
  rigs: string[];
  team?: string;
  email?: string;
  weeklyCap?: number;
  active?: boolean;
  hoursUploaded?: number;
  rating?: string;
}

export async function fetchCollectors(): Promise<Collector[]> {
  const raw = await apiGet<RawCollector[]>("getCollectors");
  return raw.map((c, i) => {
    const sheetTeam = (c.team ?? "").toUpperCase().trim();
    const team: "SF" | "MX" = sheetTeam === "SF" ? "SF" : sheetTeam === "MX" ? "MX" : SF_COLLECTOR_NAMES.has(normalizeCollectorName(c.name).toLowerCase()) ? "SF" : "MX";
    return {
      id: `c_${i}_${c.name.replace(/\s/g, "_")}`,
      name: c.name,
      rigs: c.rigs ?? [],
      team,
      email: c.email,
      weeklyCap: c.weeklyCap,
      active: c.active,
      hoursUploaded: c.hoursUploaded,
      rating: c.rating,
    };
  });
}

export async function logCollectorRigSelection(collectorName: string, rig: string, source = "TOOLS"): Promise<void> {
  const collector = normalizeCollectorName(collectorName ?? "").trim();
  const rigValue = String(rig ?? "").trim();
  if (!collector || !rigValue) return;
  await apiMetaPost<Record<string, unknown>>({ metaAction: "SET_RIG", collector, rig: rigValue, source });
}
