import styles from "./SectionHeading.module.css";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  headingId?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  headingId,
}: SectionHeadingProps) {
  return (
    <div className={`${styles.heading} ${align === "left" ? styles.left : ""}`}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2 id={headingId}>{title}</h2>
      {description ? <p className={styles.description}>{description}</p> : null}
    </div>
  );
}
