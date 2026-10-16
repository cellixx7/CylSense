/** Bloco de esqueleto. Carregamentos mostram a forma da pagina, nunca spinner. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`cyl-skeleton ${className}`} />;
}
