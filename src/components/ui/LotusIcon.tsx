type LotusIconProps = {
  className?: string;
};

export function LotusIcon({ className }: LotusIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 80 52"
      fill="none"
    >
      <path d="M40 4c7 9.1 10 17.2 0 28.5C30 21.2 33 13.1 40 4Z" />
      <path d="M19 13.5c11.4 2.2 18 7.6 18.5 21.8C24.6 32.6 19.6 25.8 19 13.5Z" />
      <path d="M61 13.5c-11.4 2.2-18 7.6-18.5 21.8C55.4 32.6 60.4 25.8 61 13.5Z" />
      <path d="M7 29.5c12.1-1.1 22.1 2.3 31.6 14.4C24.3 44.8 13.5 40.1 7 29.5Z" />
      <path d="M73 29.5C60.9 28.4 50.9 31.8 41.4 43.9 55.7 44.8 66.5 40.1 73 29.5Z" />
      <path d="M19 47c13.3 2.6 28.7 2.6 42 0" />
    </svg>
  );
}
