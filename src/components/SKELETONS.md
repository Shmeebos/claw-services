# Skeleton loading primitives

Use `src/components/Skeleton.tsx` for Claw loading states instead of writing one-off placeholder spans.

## Rules for integrators

- Put `aria-busy` on the real section, panel, form, or route shell that is loading.
- Keep individual skeleton blocks decorative. The primitives default to `aria-hidden="true"`.
- Match final dimensions with explicit widths, heights, min-heights, or existing layout classes.
- Use `tone="dark"` inside navy/dark panels; use the default light tone on warm paper, white cards, and ice-blue surfaces.
- Prefer reusable variants before adding CSS: `SkeletonLine`, `SkeletonText`, `SkeletonCard`, `SkeletonMedia`, `SkeletonButton`, `SkeletonRow`, `SkeletonGrid`, and `SkeletonSection`.
- Reduced-motion is handled globally in `src/app/globals.css`; do not add separate pulse animations.

## Common patterns

Text/card:

```tsx
<SkeletonCard lines={3} withButton />
```

Image or media tile:

```tsx
<SkeletonMedia variant="image" minHeight={218} />
<SkeletonMedia variant="service" />
```

List/queue rows:

```tsx
<SkeletonRow lines={2} />
<SkeletonRow tone="dark" trailing={false} />
```

Responsive grid:

```tsx
<SkeletonGrid items={4} columns={4} renderItem={(index) => <SkeletonCard key={index} />} />
```

Full section placeholder:

```tsx
<SkeletonSection label="Loading portal dashboard">
  <SkeletonGrid items={3} />
</SkeletonSection>
```
