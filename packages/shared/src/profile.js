function averageSentenceLength(texts) {
  const sentences = texts
    .flatMap((t) => t.split(/[.!?]/g))
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return 14;
  }

  const words = sentences.reduce((total, sentence) => total + sentence.split(/\s+/).filter(Boolean).length, 0);
  return Math.round(words / sentences.length);
}

export function buildProfileFromSamples(samples) {
  const cleaned = samples.map((s) => s.trim()).filter(Boolean);
  const avg = averageSentenceLength(cleaned);

  const profile = {
    do: [],
    avoid: [],
    signature_style: [],
    preferred_phrases: [],
    forbidden_phrases: []
  };

  if (avg <= 10) {
    profile.do.push('favor short sentences');
  } else {
    profile.do.push('use medium-length clear sentences');
  }

  const contractions = cleaned.join(' ').match(/\b(I'm|don't|can't|we're|it's|that's)\b/gi);
  if (contractions?.length) {
    profile.do.push('use contractions naturally');
  }

  profile.avoid.push('sudden tone shifts');
  return profile;
}
