import { btnPrimary } from '../shell/shellClasses'
import { getLegalDocument } from './legalDocuments.js'

export default function LegalDocumentScreen({ slug, onBack, onGotIt }) {
  const doc = getLegalDocument(slug)
  const showGotItFooter = slug === 'terms' || slug === 'privacy'
  const handleGotIt = onGotIt ?? onBack
  if (!doc) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-300" data-legal-document>
        <p className="text-center">Document not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 min-h-11 text-orange-400 hover:text-orange-300 touch-manipulation"
        >
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100"
      data-legal-document
      data-edge-scroll-shell
    >
      <header className="shrink-0 border-b border-zinc-800/90 bg-zinc-950/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 shrink-0 text-sm font-medium text-orange-400 hover:text-orange-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
          >
            ← Back
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-semibold text-zinc-50">{doc.title}</h1>
            <p className="text-[11px] text-zinc-500">Effective {doc.effectiveDate}</p>
          </div>
          <div className="w-[4.5rem] shrink-0" aria-hidden />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <article
          className={`legal-prose mx-auto max-w-2xl px-4 py-6 ${
            showGotItFooter ? 'pb-6' : 'pb-[calc(2rem+env(safe-area-inset-bottom,0px))]'
          }`}
        >
          {doc.intro ? <p className="legal-prose-lead">{doc.intro}</p> : null}
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-prose-section">
              {section.heading ? <h2>{section.heading}</h2> : null}
              {section.paragraphs.map((paragraph, idx) => (
                <p key={`${section.id}-${idx}`}>{paragraph}</p>
              ))}
            </section>
          ))}
        </article>
      </div>

      {showGotItFooter ? (
        <div className="shrink-0 border-t border-zinc-800/90 bg-zinc-950/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={handleGotIt}
              className={`${btnPrimary} min-h-11 w-full rounded-xl bg-orange-600 hover:bg-orange-500 touch-manipulation [-webkit-tap-highlight-color:transparent]`}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
