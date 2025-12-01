import { useLocation } from 'react-router-dom';
import { SEO_CONFIG } from '../components/SEO';

/**
 * Hook to get SEO configuration for the current route
 * Automatically matches the current pathname to the SEO_CONFIG
 *
 * @example
 * const seoProps = useSEO();
 * return <SEO {...seoProps} />;
 */
export function useSEO() {
  const location = useLocation();
  const pathname = location.pathname;

  // Try exact match first
  if (SEO_CONFIG[pathname]) {
    return { ...SEO_CONFIG[pathname], url: pathname };
  }

  // Try prefix match for dynamic routes (e.g., /admin/*)
  const prefixMatch = Object.keys(SEO_CONFIG).find(
    (key) => pathname.startsWith(key) && key !== '/'
  );

  if (prefixMatch) {
    return { ...SEO_CONFIG[prefixMatch], url: pathname };
  }

  // Default: return base config
  return { url: pathname };
}

export default useSEO;
