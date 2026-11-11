// What a pet is wearing, as data the PetView understands.
export function accPositions(acc) {
  const out = {};
  for (const [id, v] of Object.entries(acc || {})) if (v && v.on) out[id] = { x: v.x, y: v.y };
  return out;
}

export function outfitFor(state, id) {
  if (!id) return null;
  const outfit = state.outfits.find((entry) => entry.id === id);
  if (!outfit) return null;
  return { frames: outfit.frames, isLayer: !!outfit.isLayer, x: outfit.x || 0, y: outfit.y || 0 };
}
