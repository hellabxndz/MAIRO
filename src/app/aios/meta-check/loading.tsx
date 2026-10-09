// Shown while the live check waits on Meta.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[980px]" data-page-skeleton>
      <div className="h-8 w-56 rounded-lg bg-white/[0.06]" />
      <div className="mt-3 h-4 w-full max-w-[640px] rounded bg-white/[0.04]" />
      <p className="mt-8 text-[13.5px] text-muted">Asking Meta… this usually takes a few seconds per business.</p>
    </div>
  );
}
