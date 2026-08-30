export type PublicOpeningHours = {
  readonly day: string;
  readonly open: boolean;
  readonly opens: string;
  readonly closes: string;
};

export type PublicOpeningHoursGroup = {
  readonly label: string;
  readonly hours: string;
};

export type PublicTreatmentNavigationItem = {
  readonly href: string;
  readonly label: string;
};

export type PublicTeamMember = {
  readonly slug: string;
  readonly name: string;
  readonly role: string;
};

export type PublicVoucher = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly amountEur: number;
  readonly badge: string;
  readonly terms: string;
};

export type PublicSiteData = {
  readonly name: string;
  readonly alternateName: string;
  readonly shortName: string;
  readonly canonicalUrl: string;
  readonly language: string;
  readonly currency: "EUR";
  readonly address: {
    readonly streetAddress: string;
    readonly locality: string;
    readonly region: string;
    readonly postalCode: string | null;
    readonly countryCode: "IE";
    readonly countryName: string;
    readonly formatted: string;
    readonly localityLabel: string;
    readonly directionsUrl: string;
    readonly mapsEmbedUrl: string;
  };
  readonly serviceAreas: readonly string[];
  readonly arrival: {
    readonly floor: string;
    readonly guidance: string;
    readonly assistance: string;
  };
  readonly contact: {
    readonly phone: {
      readonly display: string;
      readonly internationalDisplay: string;
      readonly e164: string;
      readonly href: string;
    };
    readonly email: {
      readonly address: string;
      readonly href: string;
    } | null;
    readonly whatsapp: {
      readonly number: string | null;
      readonly url: string | null;
    };
  };
  readonly openingHours: readonly PublicOpeningHours[];
  readonly openingHoursGroups: readonly PublicOpeningHoursGroup[];
  readonly openingHoursConfirmed: boolean;
  readonly booking: {
    readonly enabled: boolean;
    readonly live: boolean;
    readonly booksyUrl: string | null;
    readonly reviewUrl: string | null;
  };
  readonly social: {
    readonly instagram: {
      readonly handle: string;
      readonly url: string;
    } | null;
  };
  readonly seo: {
    readonly title: string;
    readonly description: string;
  };
  readonly treatments: readonly PublicTreatmentNavigationItem[];
  readonly updatedAt: string;
};
