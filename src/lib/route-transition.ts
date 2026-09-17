export const ROUTE_TRANSITION_START_EVENT =
  "siriranee:route-transition-start";

export const ROUTE_TRANSITION_ATTRIBUTE = "data-route-transition";

export type RouteTransitionVariant = "cms" | "public";
export type RouteTransitionNavigation = "push" | "replace" | "traverse";

export type RouteTransitionStartDetail = Readonly<{
  navigationType: RouteTransitionNavigation;
  startedAt: number;
  url: string;
  variant: RouteTransitionVariant;
}>;
