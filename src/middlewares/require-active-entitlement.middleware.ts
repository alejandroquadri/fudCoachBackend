import { NextFunction, Request, Response } from 'express';
import { Entitlement, UserProfile } from '../types';

const hasValidGrant = (entitlement: Entitlement) => {
  const untilISO = entitlement.grant?.untilISO;
  return !untilISO || new Date(untilISO).getTime() > Date.now();
};

const hasUnexpiredStoreAccess = (entitlement: Entitlement) => {
  const accessExpiresAtISO =
    entitlement.accessExpiresAtISO ?? entitlement.expiresAtISO;
  if (!accessExpiresAtISO) return false;

  const accessExpiresAt = new Date(accessExpiresAtISO).getTime();
  return Number.isFinite(accessExpiresAt) && accessExpiresAt > Date.now();
};

export const requireActiveEntitlement = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user as UserProfile | undefined;
  const entitlement = user?.entitlement;
  const active =
    user?.grant === true || (entitlement?.active === true &&
    (entitlement.grant
      ? hasValidGrant(entitlement)
      : hasUnexpiredStoreAccess(entitlement)));

  if (!active) {
    return res.status(403).json({
      code: 'subscription-required',
      message: 'An active subscription is required.',
    });
  }

  next();
};
