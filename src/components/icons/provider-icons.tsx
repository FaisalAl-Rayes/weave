/**
 * Provider brand icons as inline SVGs.
 * Simplified versions of official logos for use at small sizes.
 */

interface IconProps {
  className?: string;
}

export function SplunkIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 17.5L11.5 12.5V6.5L4 11.5V17.5Z"
        fill="#65A637"
      />
      <path
        d="M12.5 6.5V12.5L20 17.5V11.5L12.5 6.5Z"
        fill="#65A637"
        opacity="0.7"
      />
      <path
        d="M4 17.5L11.5 22.5V16.5L4 11.5V17.5Z"
        fill="#65A637"
        opacity="0.5"
      />
      <path
        d="M12.5 16.5V22.5L20 17.5V11.5L12.5 16.5Z"
        fill="#65A637"
        opacity="0.35"
      />
    </svg>
  );
}

export function PrometheusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill="#E6522C" />
      <path
        d="M12 3.5C12 3.5 18.5 7 18.5 12C18.5 17 12 20.5 12 20.5C12 20.5 5.5 17 5.5 12C5.5 7 12 3.5 12 3.5Z"
        fill="#E6522C"
      />
      <rect x="8" y="17" width="8" height="1.5" rx="0.75" fill="white" />
      <rect x="9" y="19.5" width="6" height="1.5" rx="0.75" fill="white" />
      <path
        d="M12 4.5V7.5M8.5 6L10 8.5M15.5 6L14 8.5M7 9.5L9.5 10.5M17 9.5L14.5 10.5M6.5 13L9 13M17.5 13L15 13M12 9C13.6569 9 15 10.3431 15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9Z"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TempoIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#F46800" />
      <path
        d="M7 8H17M7 12H14M7 16H11"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="17" cy="15" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );
}

export function KubernetesIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2L3 7V17L12 22L21 17V7L12 2Z"
        fill="#326CE5"
      />
      <path
        d="M12 6V12M12 12L7.5 9.5M12 12L16.5 9.5M12 12L7.5 14.5M12 12L16.5 14.5M12 12V18"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="white" />
    </svg>
  );
}

export function RestIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#71717a" />
      <path
        d="M7 8H17M7 12H17M7 16H13"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2" fill="white" opacity="0.6" />
    </svg>
  );
}

/**
 * Get the provider icon component by provider name.
 */
export function ProviderIcon({
  provider,
  className = "h-4 w-4",
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case "splunk":
      return <SplunkIcon className={className} />;
    case "prometheus":
      return <PrometheusIcon className={className} />;
    case "tempo":
      return <TempoIcon className={className} />;
    case "kubernetes":
      return <KubernetesIcon className={className} />;
    case "rest":
      return <RestIcon className={className} />;
    default:
      return <RestIcon className={className} />;
  }
}
