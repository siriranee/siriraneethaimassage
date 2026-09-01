import {
  ArrowRight,
  CalendarCheck,
  Clock3,
  Gift,
  HeartHandshake,
  Leaf,
  MapPin,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { HomeHeroSlider } from "@/components/marketing/HomeHeroSlider";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { LotusIcon } from "@/components/ui/LotusIcon";
import { buildVoucherWhatsAppUrl, formatVoucherValue } from "@/lib/contact-links";
import { createMetadata } from "@/lib/metadata";
import {
  buildDaySpaJsonLd,
  buildWebSiteJsonLd,
  jsonLdScriptProps,
} from "@/lib/structured-data";
import {
  getPublicServices,
  getPublicPageCopy,
  getPublicSiteData,
  getPublicVouchers,
} from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("home");

  return createMetadata({
    title: page.seoTitle,
    description: page.seoDescription,
    path: "/",
  });
}

const featuredSlugs = [
  "traditional-thai-massage",
  "hot-oil-massage",
  "deep-tissue-massage",
  "hot-stone-massage",
] as const;

const reassuranceItems = [
  {
    icon: HeartHandshake,
    title: "Thoughtful care",
    text: "Your preferred pressure and comfort guide each appointment.",
  },
  {
    icon: Leaf,
    title: "Thai tradition",
    text: "A treatment menu inspired by traditional Thai massage styles.",
  },
  {
    icon: Sparkles,
    title: "Calm setting",
    text: "A warm, quiet treatment space in Howth, Dublin.",
  },
  {
    icon: CalendarCheck,
    title: "Book an appointment",
    text: "Choose your preferences, then contact the team to request a time.",
  },
] as const;

function buildFaqs(address: string, hasVouchers: boolean) {
  return [
  {
    question: "How do I book a massage at Siriranee?",
    answer:
      "Choose a treatment and duration on our booking page, then contact the Siriranee team to request your preferred date and time. Your appointment is confirmed directly by the team.",
  },
  {
    question: "Where is the spa?",
    answer: `We are at ${address}. Our Visit page includes directions, opening hours and arrival guidance.`,
  },
  {
    question: "Which nearby areas do you serve?",
    answer:
      "Siriranee is based in Howth and welcomes clients from Sutton, Malahide, Portmarnock, Clontarf, Raheny and across Dublin.",
  },
  {
    question: "Which massage should I choose?",
    answer:
      "Traditional Thai massage is oil-free and more active, hot oil offers a flowing treatment style, and deep tissue uses slower, firmer techniques. Choose the focused 30-minute upper-body massage when time is limited.",
  },
  {
    question: "Where can I check current prices and availability?",
    answer:
      "Prices shown on treatment pages reflect currently verified information. Contact the Siriranee team for current availability; an appointment is confirmed only after the team replies.",
  },
  ...(hasVouchers ? [{
    question: "Can I arrange a massage gift voucher?",
    answer:
      "Yes. Browse the current voucher information on this page, then contact the Siriranee team directly to arrange the voucher and confirm the latest details. Vouchers are not purchased through this website.",
  }] : []),
] as const;
}

export default async function HomePage() {
  const [services, site, pageCopy, vouchers] = await Promise.all([
    getPublicServices(),
    getPublicSiteData(),
    getPublicPageCopy("home"),
    getPublicVouchers(),
  ]);
  const featuredServices = featuredSlugs.flatMap((slug) => {
    const service = services.find((item) => item.slug === slug);
    return service ? [service] : [];
  });
  const faqs = buildFaqs(site.address.formatted, vouchers.length > 0);

  return (
    <>
      <script
        {...jsonLdScriptProps([
          buildDaySpaJsonLd(site, services),
          buildWebSiteJsonLd(site),
        ])}
      />

      <HomeHeroSlider
        description={pageCopy.description}
        eyebrow={pageCopy.eyebrow}
        slides={pageCopy.heroSlides}
        title={pageCopy.title}
      />

      <section aria-label="Why choose Siriranee" className={styles.reassuranceSection}>
        <div className={`container ${styles.reassurance}`}>
          {reassuranceItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <span className={styles.reassuranceIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`section ${styles.servicesSection}`}>
        <div className="container">
          <header className={styles.sectionHeader}>
            <LotusIcon className={styles.lotus} />
            <span className="eyebrow">Massage treatments</span>
            <h2>Find your moment of calm</h2>
            <p className="lead">
              Choose from traditional Thai, hot oil, deep tissue, hot stone and
              focused upper-body massage, with clear durations and prices.
            </p>
          </header>

          <div className={styles.serviceGrid}>
            {featuredServices.map((service) => (
              <article className={styles.serviceCard} key={service.slug}>
                <Link
                  aria-label={`View ${service.name}`}
                  className={styles.serviceImage}
                  href={`/services/${service.slug}`}
                >
                  <Image
                    alt={service.image.alt}
                    fill
                    sizes="(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 25vw"
                    src={service.image.src}
                  />
                </Link>
                <div className={styles.serviceBody}>
                  <div className={styles.serviceMeta}>
                    <span>
                      {service.pricing
                        .map(
                          (option) =>
                            `${option.durationMinutes} min · €${option.priceEur}`,
                        )
                        .join(" / ")}
                    </span>
                  </div>
                  <h3>{service.name}</h3>
                  <p>{service.shortDescription}</p>
                  <Link className={styles.cardLink} href={`/services/${service.slug}`}>
                    View treatment <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.centerAction}>
            <ButtonLink href="/services" variant="light" icon={<ArrowRight aria-hidden="true" />}>
              View all treatments
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className={styles.storySection}>
        <div className={`container ${styles.storyGrid}`}>
          <div className={styles.storyImage}>
            <Image
              alt="Illustrative spa oils, towels, candles and orchids in warm light"
              fill
              sizes="(max-width: 850px) 100vw, 50vw"
              src="/images/spa/spa-still-life.webp"
            />
            <span className={styles.storyBadge}>Howth<br />Dublin</span>
          </div>
          <div className={styles.storyCopy}>
            <span className="eyebrow">Your local retreat</span>
            <h2>A quieter pace, close to home</h2>
            <p className="lead">
              Siriranee is a welcoming massage and spa space in Howth, created
              for unrushed appointments and attentive, comfort-led treatment.
            </p>
            <p>
              Every visit begins with a simple conversation about the massage style,
              areas and pressure you prefer. The result is a treatment shaped around
              you—not a one-size-fits-all routine.
            </p>
            <ul className={styles.storyList}>
              <li><SlidersHorizontal aria-hidden="true" /> Pressure and pace discussed before treatment</li>
              <li><Clock3 aria-hidden="true" /> Short, standard and extended options across the menu</li>
              <li><MapPin aria-hidden="true" /> Floor 3 of Harbour House on Harbour Road</li>
            </ul>
            <ButtonLink href="/about" variant="light">Discover our approach</ButtonLink>
          </div>
        </div>
      </section>

      {vouchers.length ? (
        <section aria-labelledby="voucher-section-title" className={`section ${styles.voucherSection}`}>
          <div className="container">
            <header className={`${styles.sectionHeader} ${styles.voucherHeader}`}>
              <LotusIcon className={styles.lotus} />
              <span className="eyebrow">A thoughtful massage gift</span>
              <h2 id="voucher-section-title">Give someone time to unwind</h2>
              <p className="lead">
                Choose a voucher idea below, then speak with the Siriranee team to
                arrange it and confirm the current details.
              </p>
            </header>

            <div className={styles.voucherGrid}>
              {vouchers.map((voucher) => {
                const whatsappHref = buildVoucherWhatsAppUrl(voucher, {
                  businessName: site.alternateName,
                  whatsappNumber: site.contact.whatsapp.number,
                });

                return (
                  <article className={styles.voucherCard} key={voucher.id}>
                    <div className={styles.voucherTopline}>
                      <span className={styles.voucherIcon}><Gift aria-hidden="true" /></span>
                      <span>{voucher.badge || "Gift voucher"}</span>
                    </div>
                    <strong className={styles.voucherValue}>{formatVoucherValue(voucher.amountEur)}</strong>
                    <h3>{voucher.title}</h3>
                    <p>{voucher.description}</p>
                    <details className={styles.voucherDetails}>
                      <summary>Voucher details <span aria-hidden="true">+</span></summary>
                      <p>{voucher.terms}</p>
                    </details>
                    <ButtonLink
                      external={Boolean(whatsappHref)}
                      href={whatsappHref ?? "/contact"}
                      icon={<MessageCircle aria-hidden="true" />}
                      variant="light"
                    >
                      Ask about this voucher
                    </ButtonLink>
                  </article>
                );
              })}
            </div>

            <div className={styles.voucherNotice}>
              <ShieldCheck aria-hidden="true" />
              <p>
                Voucher information is shown for enquiry only. No online payment is
                taken here; purchase, collection or delivery and final terms are
                confirmed directly by the Siriranee team.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="service-areas-title"
        className={`section ${styles.areasSection}`}
      >
        <div className={`container ${styles.areasCard}`}>
          <div className={styles.areasCopy}>
            <span className={styles.areasEyebrow}>Near you in North Dublin</span>
            <h2 id="service-areas-title">
              Thai massage for Howth and nearby Dublin areas
            </h2>
            <p>
              Visit Siriranee at Harbour House in Howth. We also welcome clients
              travelling from Sutton, Malahide, Portmarnock, Clontarf, Raheny and
              across Dublin.
            </p>
            <ButtonLink href="/visit" variant="light">
              View location details
            </ButtonLink>
          </div>
          <ul aria-label="Areas served" className={styles.areaList}>
            {site.serviceAreas.map((area) => (
              <li key={area}>
                <MapPin aria-hidden="true" />
                {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.visitSection}>
        <div className={`container ${styles.visitCard}`}>
          <div className={styles.visitContent}>
            <span className={styles.visitEyebrow}>Visit Siriranee</span>
            <h2>Your massage retreat in Howth</h2>
            <p>{site.address.formatted}</p>
            <div className={styles.visitActions}>
              <ButtonLink href="/book">Book Now</ButtonLink>
              <ButtonLink href="/visit" variant="outline">Visiting information</ButtonLink>
            </div>
          </div>
          <div className={styles.visitPhoto}>
            <Image
              alt="Warm Thai spa treatment room with candles and orchids"
              fill
              sizes="(max-width: 820px) 100vw, 44vw"
              src="/images/spa/traditional-thai-massage.webp"
            />
          </div>
        </div>
      </section>

      <section className={`section ${styles.faqSection}`}>
        <div className={`container ${styles.faqGrid}`}>
          <header>
            <span className="eyebrow">Before your visit</span>
            <h2>Questions, answered</h2>
            <p className="lead">
              A few practical details to help you choose and book with confidence.
            </p>
            <ButtonLink href="/contact" variant="light">Ask the team</ButtonLink>
          </header>
          <div className={styles.faqList}>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}<span aria-hidden="true">+</span></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
