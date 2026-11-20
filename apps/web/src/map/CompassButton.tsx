type CompassButtonProps = {
  /** Turns the map back to north up. */
  onNorth(): void;
};

/**
 * The north button over a turned map. Its needle points to the store's north, turned live
 * with the map (map.css, by --map-turn), and a tap turns the map back to north up.
 */
export default function CompassButton({ onNorth }: CompassButtonProps) {
  return (
    <button
      type="button"
      className="store-map__compass"
      aria-label="Pohjoinen ylös"
      onClick={onNorth}
    >
      <svg viewBox="-10 -10 20 20" aria-hidden="true">
        <path className="store-map__needle-north" d="M0 -8 L4 0 L-4 0 Z" />
        <path className="store-map__needle-south" d="M0 8 L4 0 L-4 0 Z" />
      </svg>
    </button>
  );
}
