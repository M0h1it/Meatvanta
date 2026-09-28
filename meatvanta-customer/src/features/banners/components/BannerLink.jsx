import { Link } from "react-router-dom";

/** Wraps a banner in the link the admin chose - or nothing when it has no link. */
export default function BannerLink({ banner, children, className = "", onClick }) {
  const { linkType, linkValue } = banner;

  if (linkType === "product" && linkValue) {
    return <Link to={`/product/${linkValue}`} className={className} onClick={onClick}>{children}</Link>;
  }
  if (linkType === "category" && linkValue) {
    return <Link to={`/shop?category=${linkValue}`} className={className} onClick={onClick}>{children}</Link>;
  }
  if (linkType === "url" && linkValue) {
    if (linkValue.startsWith("/")) {
      return <Link to={linkValue} className={className} onClick={onClick}>{children}</Link>;
    }
    return (
      <a href={linkValue} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}
