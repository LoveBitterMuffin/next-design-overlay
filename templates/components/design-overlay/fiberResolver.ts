export interface SourceInfo {
  componentName: string;
  filePath: string;
  lineNumber?: number;
  selector: string;
  computedStyles: Record<string, string>;
  className: string;
  offGridProps?: OffGridProp[];
}

export interface OffGridProp {
  prop: string;
  actual: string;
  suggested: string;
}

export function check8ptGridAlignment(styles: Record<string, string>): OffGridProp[] {
  const propsToCheck = ['padding', 'margin', 'width', 'height'];
  const offGrid: OffGridProp[] = [];

  for (const prop of propsToCheck) {
    const val = styles[prop];
    if (!val) continue;

    const pxValues = val.split(/\s+/).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    for (const num of pxValues) {
      if (num % 8 !== 0) {
        const nearestMultiple = Math.round(num / 8) * 8 || 8;
        offGrid.push({
          prop,
          actual: `${num}px`,
          suggested: `${nearestMultiple}px`,
        });
        break;
      }
    }
  }

  return offGrid;
}

export function getElementSourceInfo(element: HTMLElement): SourceInfo {
  const fiberKey = Object.keys(element).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );

  let componentName = element.tagName.toLowerCase();
  let filePath = 'src/app/page.tsx';
  let lineNumber: number | undefined;

  if (fiberKey) {
    type FiberNode = {
      _debugSource?: { fileName?: string; lineNumber?: number };
      type?: { name?: string; displayName?: string } | ((...args: unknown[]) => unknown) | string;
      return?: FiberNode | null;
    };
    const fiber = (element as unknown as Record<string, FiberNode>)[fiberKey];
    let current: FiberNode | null | undefined = fiber;

    while (current) {
      if (current._debugSource) {
        filePath = current._debugSource.fileName || filePath;
        lineNumber = current._debugSource.lineNumber;
      }

      if (typeof current.type === 'function' && current.type.name) {
        componentName = current.type.name;
        break;
      } else if (typeof current.type === 'object' && current.type && current.type.displayName) {
        componentName = current.type.displayName;
        break;
      }

      current = current.return;
    }
  }

  // Extract key computed styles
  const styles = window.getComputedStyle(element);
  const computedStyles: Record<string, string> = {
    display: styles.display,
    position: styles.position,
    width: `${Math.round(element.getBoundingClientRect().width)}px`,
    height: `${Math.round(element.getBoundingClientRect().height)}px`,
    padding: styles.padding,
    margin: styles.margin,
    fontSize: styles.fontSize,
    color: styles.color,
    backgroundColor: styles.backgroundColor,
  };

  const offGridProps = check8ptGridAlignment(computedStyles);

  // Selector helper
  let selector = element.tagName.toLowerCase();
  if (element.id) {
    selector += `#${element.id}`;
  } else if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).slice(0, 2).join('.');
    if (classes) selector += `.${classes}`;
  }

  return {
    componentName,
    filePath,
    lineNumber,
    selector,
    computedStyles,
    className: typeof element.className === 'string' ? element.className : '',
    offGridProps,
  };
}
