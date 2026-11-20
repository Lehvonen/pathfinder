import logoUrl from './brand/pathfinder-logo.png';

type TopBarProps = {
  /** The logo was pressed. */
  onHome(): void;
};

/**
 * The sticky bar with the logo, the page's banner (docs/plans/logo.md §1). The logo is a
 * button; which screens show the bar and where the logo leads are the caller's business.
 */
function TopBar({ onHome }: TopBarProps) {
  return (
    <header className="app-topbar">
      <div className="app-topbar__inner">
        <button
          type="button"
          className="app-brand"
          aria-label="PathFinder, etusivulle"
          onClick={onHome}
        >
          <img src={logoUrl} alt="" width={653} height={150} className="app-logo" />
        </button>
      </div>
    </header>
  );
}

export default TopBar;
