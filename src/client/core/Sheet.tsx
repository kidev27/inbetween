import { useEffect, useId, useRef } from 'preact/hooks'
import { Close } from './icons.tsx'

/** Modal sheet on a native <dialog>: focus is trapped, Esc and a backdrop click close it. */
export function Sheet(props: { open: boolean; title: string; onClose: () => void; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (props.open && !d.open) d.showModal()
    if (!props.open && d.open) d.close()
  }, [props.open])

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby={id}
      onClose={props.onClose}
      onClick={(e) => e.target === ref.current && props.onClose()}
    >
      <div class="sheet-body">
        <header class="sheet-head">
          <h2 id={id}>{props.title}</h2>
          <button class="icon" aria-label="Close" onClick={props.onClose}>
            <Close />
          </button>
        </header>
        {props.children}
      </div>
    </dialog>
  )
}
