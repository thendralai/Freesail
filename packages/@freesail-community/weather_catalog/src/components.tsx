/**
 * @fileoverview Weather Catalog Components
 *
 * Rich weather UI components for Freesail.
 * These form the "weather_catalog_v1" vocabulary.
 *
 * Built as a standalone package using the Freesail SDK, exactly
 * the way any external developer would create a custom catalog.
 */

import React, { type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';

// =============================================================================
// Condition Icons & Colors
// =============================================================================

const CONDITION_ICONS: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  'partly-cloudy': '⛅',
  rainy: '🌧️',
  stormy: '⛈️',
  snowy: '🌨️',
  foggy: '🌫️',
  windy: '💨',
};

const CONDITION_GRADIENTS: Record<string, string> = {
  sunny: 'linear-gradient(135deg, #f5af19, #f12711)',
  cloudy: 'linear-gradient(135deg, #bdc3c7, #2c3e50)',
  'partly-cloudy': 'linear-gradient(135deg, #74b9ff, #a29bfe)',
  rainy: 'linear-gradient(135deg, #667eea, #764ba2)',
  stormy: 'linear-gradient(135deg, #434343, #000000)',
  snowy: 'linear-gradient(135deg, #e6e9f0, #eef1f5)',
  foggy: 'linear-gradient(135deg, #d7d2cc, #304352)',
  windy: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)',
};

function getConditionIcon(condition: string): string {
  const normalized = String(condition).toLowerCase().replace(/\s+/g, '-');
  return CONDITION_ICONS[normalized] ?? '🌡️';
}

function getConditionGradient(condition: string): string {
  const normalized = String(condition).toLowerCase().replace(/\s+/g, '-');
  return CONDITION_GRADIENTS[normalized] ?? 'linear-gradient(135deg, #74b9ff, #0984e3)';
}

// =============================================================================
// WeatherCard
// =============================================================================

/**
 * WeatherCard — full current-conditions card.
 */
export function WeatherCard({ component }: FreesailComponentProps) {
  const location = String((component['location'] as string) ?? 'Unknown');
  const rawTemperature = component['temperature'];
  const temperature = rawTemperature !== undefined ? parseFloat(String(rawTemperature)) : undefined;
  const unit = (component['unit'] as string) ?? 'C';
  const condition = (component['condition'] as string) ?? 'sunny';

  const rawHumidity = component['humidity'];
  const humidity = rawHumidity !== undefined ? parseFloat(String(rawHumidity)) : undefined;

  const rawWindSpeed = component['windSpeed'];
  const windSpeed = rawWindSpeed !== undefined ? parseFloat(String(rawWindSpeed)) : undefined;

  const windUnit = (component['windUnit'] as string) ?? 'km/h';

  const rawFeelsLike = component['feelsLike'];
  const feelsLike = rawFeelsLike !== undefined ? parseFloat(String(rawFeelsLike)) : undefined;

  const background = (component['background'] as string) ?? getConditionGradient(condition);

  const normalizedCondition = condition.toLowerCase().replace(/\s+/g, '-');
  const isLight = normalizedCondition === 'snowy';
  const textColor = isLight ? 'var(--freesail-text-main, #0f172a)' : 'var(--freesail-primary-text, #ffffff)';

  const containerStyle: CSSProperties = {
    background,
    borderRadius: '16px',
    padding: '24px',
    color: textColor,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minWidth: '280px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  };

  const topRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  };

  const tempStyle: CSSProperties = {
    fontSize: temperature !== undefined ? '48px' : '32px',
    fontWeight: 200,
    lineHeight: 1,
    margin: 0,
  };

  const iconStyle: CSSProperties = {
    fontSize: '48px',
    lineHeight: 1,
  };

  const detailRow: CSSProperties = {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    opacity: 0.9,
    marginTop: '12px',
    flexWrap: 'wrap',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
        {location}
      </div>
      <div style={{ fontSize: '13px', opacity: 0.8, textTransform: 'capitalize', marginBottom: '12px' }}>
        {condition.replace('-', ' ')}
      </div>
      <div style={topRow}>
        <div style={tempStyle}>
          {temperature !== undefined ? `${Math.round(temperature)}°${unit.replace('°', '')}` : 'Unknown'}
        </div>
        <span style={iconStyle}>{getConditionIcon(condition)}</span>
      </div>
      <div style={detailRow}>
        {feelsLike !== undefined && (
          <span>Feels like {Math.round(feelsLike)}°{unit.replace('°', '')}</span>
        )}
        {humidity !== undefined && <span>💧 {humidity}%</span>}
        {windSpeed !== undefined && <span>💨 {windSpeed} {windUnit}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// ForecastRow
// =============================================================================

/**
 * ForecastRow — a single day in a forecast list.
 */
export function ForecastRow({ component }: FreesailComponentProps) {
  const day = String((component['day'] as string) ?? '');
  const high = Number(component['high'] ?? 0);
  const low = Number(component['low'] ?? 0);
  const unit = (component['unit'] as string) ?? 'C';
  const condition = (component['condition'] as string) ?? 'sunny';

  const rawPrecipitation = component['precipitation'];
  const precipitation = rawPrecipitation !== undefined ? Number(rawPrecipitation) : undefined;

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--freesail-border, #e2e8f0)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
  };

  const dayStyle: CSSProperties = {
    width: '80px',
    fontWeight: 500,
    color: 'var(--freesail-text-main, #0f172a)',
  };

  const tempRange: CSSProperties = {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    minWidth: '100px',
    justifyContent: 'flex-end',
  };

  return (
    <div style={rowStyle}>
      <span style={dayStyle}>{day}</span>
      <span style={{ fontSize: '20px' }}>{getConditionIcon(condition)}</span>
      {precipitation !== undefined && precipitation > 0 && (
        <span style={{ color: 'var(--freesail-info, #3b82f6)', fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>
          {precipitation}%
        </span>
      )}
      <div style={tempRange}>
        <span style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '13px' }}>{Math.round(low)}°</span>
        <div style={{
          width: '60px',
          height: '4px',
          borderRadius: '2px',
          background: `linear-gradient(to right, #74b9ff, #e17055)`,
        }} />
        <span style={{ fontWeight: 600, color: 'var(--freesail-text-main, #0f172a)' }}>{Math.round(high)}°{unit.replace('°', '')}</span>
      </div>
    </div>
  );
}

// =============================================================================
// ForecastPanel
// =============================================================================

/**
 * ForecastPanel — container for ForecastRow children.
 */
export function ForecastPanel({ component, children }: FreesailComponentProps) {
  const title = (component['title'] as string) ?? 'Forecast';

  const panelStyle: CSSProperties = {
    background: 'var(--freesail-bg-surface, #ffffff)',
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: 'var(--freesail-shadow-md)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const titleStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--freesail-text-muted, #64748b)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  };

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>{title}</div>
      {children}
    </div>
  );
}

// =============================================================================
// TemperatureDisplay
// =============================================================================

/**
 * TemperatureDisplay — large prominent temperature reading.
 */
export function TemperatureDisplay({ component }: FreesailComponentProps) {
  const value = Number(component['value'] ?? 0);
  const unit = (component['unit'] as string) ?? 'C';
  const size = String((component['size'] as string) ?? 'lg').toLowerCase();
  const color = (component['color'] as string) ?? 'var(--freesail-text-main, #0f172a)';

  const sizeMap: Record<string, string> = {
    sm: '24px',
    md: '36px',
    lg: '56px',
    xl: '72px',
  };

  const style: CSSProperties = {
    fontSize: sizeMap[size] ?? sizeMap['lg'],
    fontWeight: 200,
    color,
    lineHeight: 1,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const unitStyle: CSSProperties = {
    fontSize: '0.5em',
    verticalAlign: 'super',
    opacity: 0.7,
  };

  return (
    <span style={style}>
      {Math.round(value)}
      <span style={unitStyle}>°{unit.replace('°', '')}</span>
    </span>
  );
}

// =============================================================================
// WeatherIcon
// =============================================================================

/**
 * WeatherIcon — condition icon/emoji at various sizes.
 */
export function WeatherIcon({ component }: FreesailComponentProps) {
  const condition = (component['condition'] as string) ?? 'sunny';
  const size = String((component['size'] as string) ?? 'md').toLowerCase();
  const animated = (component['animated'] as boolean) ?? false;

  const sizeMap: Record<string, string> = {
    sm: '24px',
    md: '40px',
    lg: '64px',
    xl: '96px',
  };

  const style: CSSProperties = {
    fontSize: sizeMap[size] ?? sizeMap['md'],
    lineHeight: 1,
    display: 'inline-block',
    animation: animated ? 'weather-pulse 2s ease-in-out infinite' : undefined,
  };

  return <span style={style}>{getConditionIcon(condition)}</span>;
}

// =============================================================================
// WindIndicator
// =============================================================================

const DIRECTION_ARROWS: Record<string, string> = {
  N: '↑', NE: '↗', E: '→', SE: '↘',
  S: '↓', SW: '↙', W: '←', NW: '↖',
};

/**
 * WindIndicator — wind speed and direction display.
 */
export function WindIndicator({ component }: FreesailComponentProps) {
  const speed = Number(component['speed'] ?? 0);
  const unit = (component['unit'] as string) ?? 'km/h';
  const direction = component['direction'] ? String(component['direction']).toUpperCase() : undefined;

  const rawGustParams = component['gustSpeed'];
  const gustSpeed = rawGustParams !== undefined ? Number(rawGustParams) : undefined;

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'var(--freesail-bg-muted, #f8fafc)',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
  };

  const arrow = direction ? (DIRECTION_ARROWS[direction] ?? '') : '';

  return (
    <div style={containerStyle}>
      <span style={{ fontSize: '20px' }}>💨</span>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--freesail-text-main, #0f172a)' }}>
          {speed} {unit} {arrow && <span style={{ fontSize: '16px' }}>{arrow}</span>}
          {direction && <span style={{ fontSize: '12px', color: 'var(--freesail-text-muted, #64748b)', marginLeft: '4px' }}>{direction}</span>}
        </div>
        {gustSpeed !== undefined && (
          <div style={{ fontSize: '12px', color: 'var(--freesail-text-muted, #64748b)' }}>
            Gusts up to {gustSpeed} {unit}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HumidityGauge
// =============================================================================

/**
 * HumidityGauge — visual gauge for humidity.
 */
export function HumidityGauge({ component }: FreesailComponentProps) {
  const value = Number(component['value'] ?? 0);
  const label = (component['label'] as string) ?? 'Humidity';
  const clamped = Math.max(0, Math.min(100, value));

  const containerStyle: CSSProperties = {
    padding: '12px 16px',
    background: 'var(--freesail-bg-muted, #f8fafc)',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const barBg: CSSProperties = {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    background: 'var(--freesail-border, #e2e8f0)',
    marginTop: '8px',
    overflow: 'hidden',
  };

  const barFill: CSSProperties = {
    width: `${clamped}%`,
    height: '100%',
    borderRadius: '3px',
    background: clamped > 70 ? 'var(--freesail-primary-hover, #1d4ed8)' : clamped > 40 ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-border-focus, #94a3b8)',
    transition: 'width 0.3s ease',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)' }}>💧 {label}</span>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--freesail-text-main, #0f172a)' }}>{clamped}%</span>
      </div>
      <div style={barBg}>
        <div style={barFill} />
      </div>
    </div>
  );
}

// =============================================================================
// UVIndex
// =============================================================================

function uvColor(uv: number): string {
  if (uv <= 2) return '#4caf50';
  if (uv <= 5) return '#ffeb3b';
  if (uv <= 7) return '#ff9800';
  if (uv <= 10) return '#f44336';
  return '#9c27b0';
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

/**
 * UVIndex — UV index display with severity coloring.
 */
export function UVIndex({ component }: FreesailComponentProps) {
  const value = Number(component['value'] ?? 0);
  const label = (component['label'] as string) ?? 'UV Index';

  const containerStyle: CSSProperties = {
    padding: '12px 16px',
    background: 'var(--freesail-bg-muted, #f8fafc)',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const dotStyle: CSSProperties = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: uvColor(value),
    display: 'inline-block',
    marginRight: '6px',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)', marginBottom: '4px' }}>☀️ {label}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={dotStyle} />
        <span style={{ fontWeight: 600, fontSize: '20px', color: 'var(--freesail-text-main, #0f172a)', marginRight: '8px' }}>
          {value}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)' }}>{uvLabel(value)}</span>
      </div>
    </div>
  );
}

// =============================================================================
// WeatherAlert
// =============================================================================

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  info: { bg: 'var(--freesail-bg-muted, #f8fafc)', border: 'var(--freesail-info, #3b82f6)', icon: 'ℹ️' },
  advisory: { bg: 'var(--freesail-warning-bg, #fffbeb)', border: 'var(--freesail-warning, #f59e0b)', icon: '⚠️' },
  watch: { bg: '#fff8e1', border: 'var(--freesail-warning, #f59e0b)', icon: '👁️' },
  warning: { bg: 'var(--freesail-error-subtle, #fef2f2)', border: 'var(--freesail-error, #ef4444)', icon: '🚨' },
};

/**
 * WeatherAlert — warning or advisory banner.
 */
export function WeatherAlert({ component }: FreesailComponentProps) {
  const severity = String((component['severity'] as string) ?? 'info').toLowerCase();
  const title = (component['title'] as string) ?? 'Alert';
  const message = component['message'] as string | undefined;
  const expires = component['expires'] as string | undefined;

  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES['info']!;

  const containerStyle: CSSProperties = {
    background: s.bg,
    borderLeft: `4px solid ${s.border}`,
    borderRadius: 'var(--freesail-radius-md, 8px)',
    padding: '12px 16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--freesail-text-main, #0f172a)', marginBottom: message ? '4px' : 0 }}>
        {s.icon} {title}
      </div>
      {message && <div style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)' }}>{message}</div>}
      {expires && (
        <div style={{ fontSize: '11px', color: 'var(--freesail-text-muted, #64748b)', marginTop: '6px' }}>
          Expires: {expires}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SunriseSunset
// =============================================================================

/**
 * SunriseSunset — sunrise/sunset times display.
 */
export function SunriseSunset({ component }: FreesailComponentProps) {
  const sunrise = (component['sunrise'] as string) ?? '--:--';
  const sunset = (component['sunset'] as string) ?? '--:--';

  const containerStyle: CSSProperties = {
    padding: '12px 16px',
    background: 'var(--freesail-bg-muted, #f8fafc)',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
  };

  const arcStyle: CSSProperties = {
    width: '100%',
    height: '40px',
    borderRadius: '40px 40px 0 0',
    borderTop: '2px solid var(--freesail-warning, #f5af19)',
    borderLeft: '2px solid var(--freesail-warning, #f5af19)',
    borderRight: '2px solid var(--freesail-warning, #f5af19)',
    borderBottom: 'none',
    marginTop: '8px',
    position: 'relative',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)' }}>🌅 Sunrise & Sunset</div>
      <div style={arcStyle} />
      <div style={rowStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--freesail-text-muted, #64748b)' }}>Sunrise</div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--freesail-text-main, #0f172a)' }}>{sunrise}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--freesail-text-muted, #64748b)' }}>Sunset</div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--freesail-text-main, #0f172a)' }}>{sunset}</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AirQuality
// =============================================================================

function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#4caf50';
  if (aqi <= 100) return '#ffeb3b';
  if (aqi <= 150) return '#ff9800';
  if (aqi <= 200) return '#f44336';
  if (aqi <= 300) return '#9c27b0';
  return '#7e0023';
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * AirQuality — AQI display with color coding.
 */
export function AirQuality({ component }: FreesailComponentProps) {
  const value = Number(component['value'] ?? 0);
  const label = (component['label'] as string) ?? 'Air Quality';
  const pollutant = component['pollutant'] as string | undefined;

  const containerStyle: CSSProperties = {
    padding: '12px 16px',
    background: 'var(--freesail-bg-muted, #f8fafc)',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const dotStyle: CSSProperties = {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: aqiColor(value),
    display: 'inline-block',
    marginRight: '6px',
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)', marginBottom: '4px' }}>🌬️ {label}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={dotStyle} />
        <span style={{ fontWeight: 600, fontSize: '20px', color: 'var(--freesail-text-main, #0f172a)', marginRight: '8px' }}>
          {value}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)' }}>{aqiLabel(value)}</span>
      </div>
      {pollutant && (
        <div style={{ fontSize: '11px', color: 'var(--freesail-text-muted, #64748b)', marginTop: '4px' }}>
          Primary: {pollutant}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Export catalog components map
// =============================================================================

export const weatherCatalogComponents = {
  WeatherCard,
  ForecastRow,
  ForecastPanel,
  TemperatureDisplay,
  WeatherIcon,
  WindIndicator,
  HumidityGauge,
  UVIndex,
  WeatherAlert,
  SunriseSunset,
  AirQuality,
};
