import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Plain GET form: works without JavaScript and keeps filters in the URL. */
export function SearchForm({ placeholder, defaultValue, hidden }: { placeholder: string; defaultValue?: string; hidden?: Record<string, string> }) {
  return (
    <form className="relative w-full sm:w-72" role="search">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <Input name="q" type="search" placeholder={placeholder} defaultValue={defaultValue} className="pl-9" aria-label={placeholder} />
    </form>
  );
}
