import {
  ROUTE_TRANSITION_ATTRIBUTE,
  ROUTE_TRANSITION_START_EVENT,
  type RouteTransitionNavigation,
  type RouteTransitionStartDetail,
} from "@/lib/route-transition";

export function onRouterTransitionStart(
  url: string,
  navigationType: RouteTransitionNavigation,
) {
  try {
    const target = new URL(url, window.location.href);
    if (target.origin !== window.location.origin) return;

    const current = new URL(window.location.href);
    if (
      target.pathname === current.pathname &&
      target.search === current.search
    ) {
      return;
    }

    const detail: RouteTransitionStartDetail = {
      navigationType,
      startedAt: performance.now(),
      url: target.href,
      variant: target.pathname.startsWith("/cms") ? "cms" : "public",
    };
    document.documentElement.setAttribute(
      ROUTE_TRANSITION_ATTRIBUTE,
      detail.variant,
    );
    window.dispatchEvent(
      new CustomEvent<RouteTransitionStartDetail>(
        ROUTE_TRANSITION_START_EVENT,
        { detail },
      ),
    );
  } catch {
    document.documentElement.removeAttribute(ROUTE_TRANSITION_ATTRIBUTE);
  }
}
