export interface NavGroup {
  label: string;
  items: string[];
}

export const NAV: NavGroup[] = [
  { label: "Start", items: ["introduction", "quickstart"] },
  { label: "Concepts", items: ["rent", "collection-account", "slots", "market", "provenance"] },
  { label: "Guides", items: ["launch", "integrate"] },
  { label: "Reference", items: ["instructions", "errors", "logs", "client", "limits"] },
  { label: "Network", items: ["deployments"] },
];

export const ORDER = NAV.flatMap((g) => g.items);

export const groupOf = (id: string) => NAV.find((g) => g.items.includes(id))?.label ?? "";

export const docHref = (id: string) => (id === "introduction" ? "/docs/" : `/docs/${id}/`);
