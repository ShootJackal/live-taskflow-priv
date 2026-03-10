import { buildRigSortValue } from "@/components/tools/toolConstants";

export function deriveRigOptions(selectedCollectorRigs: string[], selectedRig: string) {
  const rigSet = new Set<string>();
  for (const rig of selectedCollectorRigs) {
    const clean = String(rig ?? "").trim();
    if (clean) rigSet.add(clean);
  }
  if (selectedRig) rigSet.add(selectedRig);

  return Array.from(rigSet)
    .sort((a, b) => {
      const [aNum, aText] = buildRigSortValue(a);
      const [bNum, bText] = buildRigSortValue(b);
      if (aNum !== bNum) return aNum - bNum;
      return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
    })
    .map((rig) => ({ value: rig, label: rig }));
}
