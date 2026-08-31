import { Loader2 } from 'lucide-react';
import { cn } from './cn';

// Destructive is an outline, not a filled red button: in this console the destructive
// actions (revoke, delete, rotate key) sit in rows of otherwise-neutral buttons, and a
// solid red block reads as the primary action of the row rather than its danger.
const VARIANTS = {
  primary: 'bg-accent text-accent-ink font-semibold border border-transparent hover:opacity-90',
  secondary: 'bg-transparent text-text border border-border-2 hover:bg-raised',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-raised hover:text-text',
  destructive: 'bg-bad/8 text-bad border border-bad/35 hover:bg-bad/15',
};

// `loading` disables the button and swaps its leading icon for a spinner -- callers still own
// their own label text (e.g. "Saving…"), this just makes "something is happening" visible even
// when a click doesn't change the label at all.
export function Button({ variant = 'primary', className, loading, disabled, children, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        // whitespace-nowrap/shrink-0: as flex children these squeeze to min-content and the
        // label wraps out of the fixed height, which reads as the padding having vanished.
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[12.5px] font-medium',
        // The design specifies the focus ring as color-mix(accent 40%, transparent);
        // ring-accent/40 is Tailwind's own spelling of exactly that and compiles to the
        // same color-mix, so there is no arbitrary value here to typo or mis-infer.
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // A single sizing rule for every button icon instead of each call site guessing its own
        // number -- that's how they ended up scattered 11-16px, visibly small against a 32px
        // button. `>svg` (direct child only) deliberately does not reach the flame-icon spice
        // picker in MenuEditor, which wraps its icons in a span on purpose to stay compact.
        '[&>svg]:size-5',
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

// Square button for a bare icon -- topbar theme/notification controls, row actions. Its icon
// carries the button's entire meaning with no label alongside it, so both the button and its icon
// run bigger than a labelled Button's -- see the `.icon-btn` rule in index.css, which sets both
// (not `w-8`/`h-8` here) for why that has to be a plain, unlayered CSS rule rather than a second
// same-property className fighting Button's own.
export function IconButton({ className, ...props }) {
  return <Button variant="secondary" className={cn('icon-btn px-0', className)} {...props} />;
}
