// Program logo. Placeholder "MI" shield until official Mercer Island assets
// are supplied — swap public/brand/logo.svg (and BRAND.logoPath) to update.
import { BRAND } from '../lib/brand.js'

export default function BrandLogo({ size = 48, className }) {
  const imgSize = className?.includes('w-16') || className?.includes('h-16') ? 64 : size
  return (
    <img
      src={BRAND.logoPath}
      alt={BRAND.logoAlt}
      width={imgSize}
      height={imgSize}
      style={{ objectFit: 'contain' }}
      className={className || 'block'}
    />
  )
}
