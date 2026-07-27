import { createPortal } from 'react-dom';

/**
 * The frosted sheet every dialog sits on.
 *
 * Two things made this worth centralising rather than repeating per modal.
 *
 * First, it has to be portalled to <body>. Cards, the header and the content
 * frame all carry `backdrop-filter`, and an element with a backdrop filter
 * becomes a containing block for `position: fixed` descendants - so a scrim
 * rendered in place covers only its own container and leaves the header and the
 * page margins bright, which is exactly the half-dimmed look this replaces.
 *
 * Second, blurring what is behind it is the app's own idiom: Ctrl+Space already
 * frosts the whole board, and a dialog that only dims reads as a different class
 * of thing than one that frosts. One component, one look.
 */

export default function Scrim({ leaving = false, onDismiss, children }) {
  return createPortal(
    <div
      className={`acc-scrim ${leaving ? 'acc-scrim--leaving' : 'acc-fade-enter'}`}
      onMouseDown={onDismiss}
      role="presentation"
    >
      {children}
    </div>,
    document.body
  );
}
