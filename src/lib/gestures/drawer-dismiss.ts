export type DrawerDrag = {
  x: number;
  y: number;
  time: number;
  axis: "pending" | "down" | "cancelled";
  distance: number;
};

export function moveDrawerDrag(drag: DrawerDrag, x: number, y: number) {
  const dx = Math.abs(x - drag.x);
  const dy = y - drag.y;
  if (drag.axis === "pending" && Math.max(dx, Math.abs(dy)) >= 10) {
    drag.axis = dy > dx * 1.25 ? "down" : "cancelled";
  }
  // A gesture that turns sideways or upward must also return the drawer.
  drag.distance = drag.axis === "down" && dy > dx * 1.25 ? dy : 0;
  return drag.distance;
}

export function shouldDismissDrawer(drag: DrawerDrag, time: number) {
  const velocity = drag.distance / Math.max(time - drag.time, 1);
  return (
    drag.axis === "down" &&
    (drag.distance >= 72 || (drag.distance >= 28 && velocity >= 0.55))
  );
}
