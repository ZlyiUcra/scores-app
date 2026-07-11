import { useState, type ReactNode } from 'react';
import { accordionIcons } from '../constants';

type AccordionProps = {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Independent collapsible section - each instance owns its own open/closed
 * state, siblings do not affect each other. The heading wraps the toggle
 * button so the section stays a heading for screen readers. */
export function Accordion({ title, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="accordion">
      <h3 className="accordion__heading">
        <button
          type="button"
          className="accordion__header"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`accordion__icon${open ? ' accordion__icon--open' : ''}`}>{accordionIcons.toggle}</span>
          {title}
        </button>
      </h3>
      {open && <div className="accordion__body">{children}</div>}
    </section>
  );
}
