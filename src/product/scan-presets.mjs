export const SCAN_PRESETS = Object.freeze({
  quick: Object.freeze({
    id: "quick",
    label: "Quick audit",
    description: "Recommended first scan using the latest 12 posts.",
    configuration: Object.freeze({
      postLimit: 12,
      likes: true,
      comments: true,
      refreshPostCounts: true,
      lowParticipationPercent: 10,
      lowEngagedPosts: 1
    })
  }),
  deep: Object.freeze({
    id: "deep",
    label: "Deep audit",
    description: "Scans all posts returned by the connector. Slower and more request-intensive.",
    configuration: Object.freeze({
      postLimit: 0,
      likes: true,
      comments: true,
      refreshPostCounts: true,
      lowParticipationPercent: 10,
      lowEngagedPosts: 1
    })
  }),
  custom: Object.freeze({
    id: "custom",
    label: "Custom",
    description: "Start from recommended defaults and customize the audit.",
    configuration: Object.freeze({
      postLimit: 24,
      likes: true,
      comments: true,
      refreshPostCounts: true,
      lowParticipationPercent: 10,
      lowEngagedPosts: 1
    })
  })
});

export function getScanPreset(id = "quick") {
  const preset = SCAN_PRESETS[id] ?? SCAN_PRESETS.quick;
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    configuration: { ...preset.configuration }
  };
}

export function resolveScanConfiguration({ preset = "quick", overrides = {} } = {}) {
  const base = getScanPreset(preset);
  return {
    preset: base.id,
    ...base.configuration,
    ...overrides
  };
}
