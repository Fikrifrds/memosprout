/**
 * Shared site footer: attribution to Mlola and a contact address.
 *
 * Both pages had their own footer with different content, so a change had to
 * be made twice and drifted. `extra` keeps the one genuine difference — the
 * docs page points at deeper reference material — without forking the
 * attribution and contact lines that must stay identical.
 */
export function SiteFooter({ extra }: { extra?: React.ReactNode }) {
  return (
    <footer className="mt-12 border-t border-slate-200 py-8 text-center">
      {extra}
      <p className="text-sm text-slate-500">
        <span className="lowercase">memosprout</span> — correct once. Improve every
        interaction.
      </p>
      <p className="mt-3 text-sm text-slate-500">
        Built by{" "}
        <a
          href="https://mlola.com"
          className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
        >
          Mlola
        </a>
        {" · "}
        <a
          href="mailto:hello@mlola.com"
          className="underline underline-offset-2 hover:text-slate-900"
        >
          hello@mlola.com
        </a>
      </p>
    </footer>
  );
}
