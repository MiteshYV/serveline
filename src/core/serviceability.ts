/**
 * Is this address deliverable from this outlet? Build Spec §5.2 (checked by area or pincode) and
 * §6 (the delivery form checks on pincode).
 *
 * A refusal is a designed screen with a way forward, not an error, so it comes back as a value
 * with a reason — same shape as `canRedeem`, for the same reason.
 */

export type ServiceabilityRefusal = 'no_location_given' | 'pincode_not_served' | 'area_not_served'

export type ServiceabilityResult =
  | { ok: true }
  | { ok: false; reason: ServiceabilityRefusal }

/** What the delivery form or the voice turn has so far. The page gives a pincode; a call gives an area. */
export type DeliveryLocation = { pincode?: string; area?: string }

/** The `outlet` fields that define where it delivers. Build Spec §4. */
export type OutletServiceArea = {
  area: string
  serviceablePincodes: readonly string[]
}

// Customers type "560 038" and staff paste trailing spaces into settings; neither should decide
// whether an order is taken.
const normalisePincode = (value: string) => value.replace(/\s/g, '')
const normaliseArea = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

export function checkServiceability(
  location: DeliveryLocation,
  outlet: OutletServiceArea,
): ServiceabilityResult {
  // ponytail: a pincode list and one area name is the ceiling. It breaks the day an outlet covers
  // only part of a pincode — one side of a main road, a layout the rider will not enter — and the
  // upgrade is outlet.lat/lng against the address's lat/lng within outlet.delivery_radius_km,
  // columns that already exist on both tables. Not yet: Build Spec §5.2 specifies area or
  // pincode, so this is the agreed behaviour rather than a corner cut.

  const pincode = location.pincode ? normalisePincode(location.pincode) : ''
  if (pincode) {
    // A pincode is exact, so a miss is final. Falling back to the area here would let a wrong
    // pincode through on a matching area name, which is worse than refusing.
    //
    // An outlet with an empty `serviceable_pincodes` therefore serves nowhere. That is the right
    // reading of a half-finished onboarding: a refused order the restaurant can chase is
    // recoverable, an accepted order it cannot deliver is not.
    return outlet.serviceablePincodes.some((p) => normalisePincode(p) === pincode)
      ? { ok: true }
      : { ok: false, reason: 'pincode_not_served' }
  }

  const area = location.area ? normaliseArea(location.area) : ''
  if (area) {
    // Build Spec §5.2: the voice path has an area and a landmark and no pincode at all.
    return normaliseArea(outlet.area) === area
      ? { ok: true }
      : { ok: false, reason: 'area_not_served' }
  }

  return { ok: false, reason: 'no_location_given' }
}
