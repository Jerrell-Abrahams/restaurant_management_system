import { cn } from './cn';

// A native checkbox under the hood -- keyboard and screen-reader behavior for free -- just drawn
// as a track + thumb instead of the browser default. No @radix-ui/react-switch: one input and two
// spans is the whole component, not worth a dependency.
export function Switch({ className, ...props }) {
  return (
    <label className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer', className)}>
      <input type="checkbox" className="peer absolute inset-0 opacity-0" {...props} />
      <span
        className="absolute inset-0 rounded-full bg-border-2 transition-colors
          peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2
          peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent/40"
      />
      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </label>
  );
}
