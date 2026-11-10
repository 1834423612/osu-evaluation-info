# Interface motion

Motion uses the shared `--motion-fast`, `--motion-ui`, `--motion-panel`, and easing
variables in `src/app/globals.css`. Fine-pointer controls use brief visual
feedback; touch controls use shorter durations and avoid persistent hover
movement. Page, panel, tab, tooltip, loading, and action-feedback transitions
use opacity or transforms rather than animating layout dimensions. Pages do
not retain transforms after their entrance, keeping fixed and portaled surfaces
anchored to the viewport. Vaul continues to own its interactive drawer transform
and release animation.

The course drawer has a full-width 32 px touch handle, with a small centered
visual grip. Dragging that region dismisses it; the content keeps independent
vertical scrolling and horizontal tab swipes. Keyboard focus rings remain on
controls, while the dialog container avoids the browser's extra outline.
Translation preferences use a collision-aware portal above enclosing navigation
and course panels. Toasts retain their undo action and fade before removal.

`prefers-reduced-motion: reduce` disables repeating loaders, removes movement
feedback, minimizes transition time, and makes programmatic pagination scrolls
immediate. No permanent layer promotion or animation library is added.

Desktop and touch browser checks cover panel entry/exit, course tabs, saved-item
toasts, page navigation, ordinary/reduced motion, drawer touch dismissal,
content scroll, and translation preference layering. Screenshots and temporary
interaction scripts are kept outside the repository.

The return-to-top control uses the visual viewport and moves out of the way of
translation guides, menus, toasts, other fixed widgets, and nearby links/buttons.
Full-screen covers and modal dialogs hide it. Resize/mutation observers and
short animation sampling update placement without a permanent polling loop.
Pagination uses the same scroll behavior on activation and after results load;
reduced-motion users return immediately.
