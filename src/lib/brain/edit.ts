import { FIELD_BY_KEY, isMarketingField, type FactMeta, type FactSource } from "./catalog";
import { displayValue, hasValue, mayReplace, newMeta } from "./rules";

// Every change to the Business Brain goes through here, whoever makes it —
// the owner on the Business Brain page, an answer in the Campaign Review,
// the assistant, a website read, or results. Pure, so the rules are pinned:
//
//   - The customer's word wins. An inference never overwrites what the
//     business told or confirmed MAIRO.
//   - Nothing is silently lost. A removed fact, or a confirmed one replaced by
//     a new one, moves to history ("Previously: window tinting") — it stops
//     being current, but MAIRO remembers why its strategy changed.
//   - Only marketing facts. A field without a marketing purpose is refused.

type Product = {
  name: string;
  price: string | null;
  category: string | null;
  notes: string | null;
  kind: "product" | "service" | null;
  priority: "high" | "normal" | "low" | null;
  profitability: "high" | "normal" | "low" | null;
  status: "available" | "unavailable" | "seasonal" | "new" | null;
  goal: string | null;
};
type Profile = Record<string, unknown> & { products: Product[] };
type Historical = { field: string; text: string; until: string; source: FactSource };

export type BrainState = { profile: Profile; meta: Record<string, FactMeta>; history: Historical[] };

export type FactChange =
  | { op: "set"; field: string; value: string }
  | { op: "add"; field: string; value: string }
  | { op: "remove"; field: string; value?: string }
  | { op: "confirm"; field: string }
  | { op: "product"; name: string; patch: Partial<Omit<Product, "name">> }
  | { op: "remove-product"; name: string };

export type ChangeResult<T extends BrainState> = { state: T; changed: boolean; text: string; refused?: string };

const clean = (v: string, max = 300) => v.trim().replace(/\s+/g, " ").slice(0, max);

export function applyChange<T extends BrainState>(input: T, change: FactChange, source: FactSource, now: Date): ChangeResult<T> {
  const state = { ...input, profile: { ...input.profile, products: input.profile.products.map((p) => ({ ...p })) }, meta: { ...input.meta }, history: [...input.history] };
  const at = now.toISOString();
  const refuse = (why: string): ChangeResult<T> => ({ state: input, changed: false, text: why, refused: why });

  if (change.op === "product" || change.op === "remove-product") {
    const name = clean(change.name, 200);
    if (!name) return refuse("Say which product or service.");
    const i = state.profile.products.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (change.op === "remove-product") {
      if (i === -1) return refuse(`MAIRO doesn't have “${name}” on file.`);
      const [gone] = state.profile.products.splice(i, 1);
      state.history.push({ field: "products", text: `Previously offered ${gone.name}`, until: at, source });
      state.meta.products = newMeta(source, now);
      return { state, changed: true, text: `MAIRO will stop treating ${gone.name} as something you sell.` };
    }
    const patch = Object.fromEntries(Object.entries(change.patch).filter(([, v]) => v !== undefined)) as Partial<Product>;
    if (i === -1) {
      state.profile.products.push({ name, price: null, category: null, notes: null, kind: null, priority: null, profitability: null, status: null, goal: null, ...patch });
    } else {
      state.profile.products[i] = { ...state.profile.products[i], ...patch };
    }
    state.meta.products = newMeta(source, now);
    const what =
      patch.status === "unavailable" ? `${name} is unavailable — MAIRO won't promote it`
        : patch.status === "available" ? `${name} is available again`
          : patch.priority === "high" ? `${name} is a priority`
            : `${name} updated`;
    return { state, changed: true, text: what };
  }

  const def = FIELD_BY_KEY[change.field];
  if (!def || !isMarketingField(change.field)) return refuse("MAIRO only keeps what can improve your marketing.");
  const current = state.profile[change.field];

  if (change.op === "confirm") {
    if (!hasValue(current)) return refuse(`MAIRO doesn't have “${def.label.toLowerCase()}” yet.`);
    state.meta[change.field] = { ...newMeta("customer", now), source: state.meta[change.field]?.source ?? "customer" };
    state.meta[change.field].status = "confirmed";
    return { state, changed: true, text: `Thanks — ${def.label.toLowerCase()} confirmed.` };
  }

  if (change.op === "remove") {
    if (!hasValue(current)) return refuse(`MAIRO doesn't have “${def.label.toLowerCase()}”.`);
    if (def.list && change.value) {
      const list = current as string[];
      const keep = list.filter((x) => x.toLowerCase() !== change.value!.toLowerCase());
      if (keep.length === list.length) return refuse(`“${change.value}” isn't in ${def.label.toLowerCase()}.`);
      state.profile[change.field] = keep;
      state.history.push({ field: change.field, text: `${def.label}: ${change.value} (no longer)`, until: at, source });
    } else {
      state.profile[change.field] = def.list ? [] : "";
      state.history.push({ field: change.field, text: `${def.label}: ${displayValue(current)} (no longer)`, until: at, source });
    }
    state.meta[change.field] = newMeta(source, now);
    return { state, changed: true, text: `Removed — MAIRO won't use it anymore.` };
  }

  const value = clean(change.value, def.list ? 300 : 2000);
  if (!value) return refuse("Type something first.");
  if (!mayReplace(state.meta[change.field], source) && hasValue(current)) {
    // An inference never overwrites the business's own word.
    return refuse(`You told MAIRO “${displayValue(current)}”, so it keeps that.`);
  }
  if (change.field === "presence" && !["local", "online", "both"].includes(value)) return refuse("Choose local, online or both.");

  if (def.list) {
    const list = (Array.isArray(current) ? current : []) as string[];
    if (change.op === "add") {
      if (list.some((x) => x.toLowerCase() === value.toLowerCase())) {
        state.meta[change.field] = { ...newMeta(source, now) };
        return { state, changed: false, text: "MAIRO already knew this." };
      }
      state.profile[change.field] = [...list, value].slice(-30);
    } else {
      if (list.length && state.meta[change.field]?.status === "confirmed") {
        state.history.push({ field: change.field, text: `${def.label}: ${list.join(", ")}`, until: at, source });
      }
      state.profile[change.field] = [value];
    }
  } else {
    const old = typeof current === "string" ? current.trim() : "";
    if (old && old.toLowerCase() !== value.toLowerCase() && state.meta[change.field]?.status === "confirmed") {
      state.history.push({ field: change.field, text: `${def.label}: ${old}`, until: at, source });
    }
    state.profile[change.field] = value;
  }
  state.meta[change.field] = newMeta(source, now);
  return { state, changed: true, text: `MAIRO learned this: ${def.label.toLowerCase()} — ${value}.` };
}

/**
 * Whether the assistant must ask before making a change from chat. Removing
 * or replacing what MAIRO knows is permanent, so the business confirms it
 * first ("Should MAIRO stop mentioning free estimates?"). Adding a fact,
 * confirming one, or marking something sold out or back is easy to undo, so
 * it happens straight away and MAIRO says what it changed.
 */
export function requiresConfirmation(change: FactChange): boolean {
  return change.op === "remove" || change.op === "remove-product" || change.op === "set";
}

/** The question the assistant asks before a permanent change. */
export function confirmationQuestion(change: FactChange): string {
  const label = "field" in change ? (FIELD_BY_KEY[change.field]?.label.toLowerCase() ?? change.field) : "";
  switch (change.op) {
    case "remove":
      return change.value ? `Should MAIRO remove “${change.value}” from ${label}?` : `Should MAIRO forget your ${label}?`;
    case "remove-product":
      return `Should MAIRO stop treating ${change.name} as something you sell?`;
    case "set":
      return `Should MAIRO change your ${label} to “${change.value}”?`;
    default:
      return "Should MAIRO make this change?";
  }
}
