import {
  HandHeart,
  MessageCircleHeart,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";

import { BookingCta } from "@/components/marketing/BookingCta";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import {
  getPublicPageCopy,
  getPublicTeam,
} from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const [page, teamMembers] = await Promise.all([
    getPublicPageCopy("therapists"),
    getPublicTeam(),
  ]);

  return createMetadata({
    title: page.seoTitle,
    description: page.seoDescription,
    path: "/therapists",
    noIndex: teamMembers.length === 0,
  });
}

const carePrinciples = [
  {
    icon: MessageCircleHeart,
    title: "A thoughtful welcome",
    text: "Your visit starts with a simple conversation about the treatment you selected and your comfort preferences.",
  },
  {
    icon: HandHeart,
    title: "Care at your pace",
    text: "You can speak up at any point about pressure, positioning or anything that would make the experience more comfortable.",
  },
  {
    icon: ShieldCheck,
    title: "Clear, respectful care",
    text: "We value privacy, clear communication and a professional treatment setting from arrival to departure.",
  },
];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function TherapistsPage() {
  const [teamMembers, pageCopy] = await Promise.all([
    getPublicTeam(),
    getPublicPageCopy("therapists"),
  ]);

  return (
    <div>
      <PageHero
        {...pageHeroImages.about}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />

      {teamMembers.length ? (
        <section className={styles.teamSection} aria-labelledby="team-heading">
          <div className={styles.container}>
            <SectionHeading
              title="Team Profiles"
              headingId="team-heading"
              description="Published introductions to the Siriranee team."
            />
            <div className={styles.teamGrid}>
              {teamMembers.map((member) => (
                <article className={styles.memberCard} key={member.slug}>
                  <div className={styles.monogram} aria-hidden="true">
                    <span>{getInitials(member.name)}</span>
                  </div>
                  <div className={styles.memberCopy}>
                    <p>Team member</p>
                    <h3>{member.name}</h3>
                    <span className={styles.memberNote}>{member.role}</span>
                  </div>
                  <span className={styles.memberIcon} aria-hidden="true">
                    <UserRound size={18} strokeWidth={1.7} />
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.principlesSection} aria-labelledby="care-heading">
        <div className={styles.container}>
          <SectionHeading
            eyebrow="During your appointment"
            title="Comfort comes through communication"
            headingId="care-heading"
            description="Every person experiences massage differently. These simple principles help keep your visit clear, respectful and comfortable."
          />
          <div className={styles.principlesGrid}>
            {carePrinciples.map(({ icon: Icon, title, text }, index) => (
              <article className={styles.principleCard} key={title}>
                <div className={styles.principleTopline}>
                  <span className={styles.principleIcon}>
                    <Icon aria-hidden="true" size={24} strokeWidth={1.55} />
                  </span>
                  <span className={styles.index}>0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <BookingCta
            title="Choose your treatment and duration"
            description="Choose your treatment and preferred duration, then request a date and time."
            secondaryHref="/services"
            secondaryLabel="Explore treatments"
          />
        </div>
      </section>
    </div>
  );
}
