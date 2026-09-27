// Scrolls exactly one container to reveal one target element, computed purely from
// getBoundingClientRect deltas and the container's own current scrollTop, then applied via
// container.scrollTo(). This deliberately avoids Element.scrollIntoView(): that method lets
// the browser pick which scrollable ancestor to move (and how far), and if any container in
// the chain isn't a genuine scroll boundary (wrong flex/grid height chain, a common CSS bug),
// it can end up scrolling the whole window instead of the one panel you meant — which is
// exactly what dragged unrelated content out of view here. This only ever touches `container`.
export function scrollIntoContainer(container: HTMLElement, target: HTMLElement, align: "center" | "nearest" = "nearest"): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  if (align === "nearest" && targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom) {
    return; // already fully visible — don't move the scroll position at all
  }

  const targetTopWithinContainer = container.scrollTop + (targetRect.top - containerRect.top);
  const desiredScrollTop =
    align === "center"
      ? targetTopWithinContainer - container.clientHeight / 2 + targetRect.height / 2
      : targetRect.top < containerRect.top
        ? targetTopWithinContainer
        : targetTopWithinContainer - container.clientHeight + targetRect.height;

  container.scrollTo({ top: Math.max(0, desiredScrollTop), behavior: "smooth" });
}
