/**
 * HeatEvents — Event message templates for the Heat & Threat system.
 * Used by HeatSystem to emit flavor text for protests, raids, and propaganda.
 */

export type HeatEventType = 'protest' | 'police_raid' | 'game_over_raid' | 'heat_reduced' | 'heat_added';

export interface HeatEventTemplate {
  type: HeatEventType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'critical';
}

export const HEAT_EVENT_TEMPLATES: Record<HeatEventType, HeatEventTemplate> = {
  protest: {
    type: 'protest',
    title: 'Protesters Gather',
    message: 'A group of protesters has gathered outside your compound. They chant slogans and hold signs. The authorities are watching.',
    severity: 'warning',
  },
  police_raid: {
    type: 'police_raid',
    title: 'Police Raid!',
    message: 'Police have raided your compound! {arrestedCount} cultist(s) were arrested and ${fundsConfiscated} in funds were confiscated.',
    severity: 'danger',
  },
  game_over_raid: {
    type: 'game_over_raid',
    title: 'Compound Shut Down',
    message: 'A massive law enforcement operation has shut down your compound. The cult has been busted!',
    severity: 'critical',
  },
  heat_reduced: {
    type: 'heat_reduced',
    title: 'Heat Reduced',
    message: 'A successful propaganda campaign has reduced your heat by {amount}. The public is calmer now.',
    severity: 'info',
  },
  heat_added: {
    type: 'heat_added',
    title: 'Heat Increased',
    message: '{reason} Heat is now at {heat}.',
    severity: 'warning',
  },
};

/**
 * Format a template string with the given parameters.
 */
export function formatHeatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}