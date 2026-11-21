import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke, router } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  Button,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  Textfield,
  useProductContext,
  xcss,
} from "@forge/react";

const WEB_HUB_URL = "https://nsops.vercel.app";

const fullWidthBox = xcss({
  width: "100%",
});

const cardStyle = xcss({
  backgroundColor: "elevation.surface.raised",
  borderColor: "color.border",
  borderStyle: "solid",
  borderWidth: "border.width",
  borderRadius: "border.radius.200",
  padding: "space.200",
  width: "100%",
});

const COPY = {
  en: {
    title: "Northstar Ops",
    subtitle: "Geo-Intelligence, Zone Quoting & Atlassian Automation",
    runsBadge: "Runs on Atlassian · Zero Egress",
    openWebHub: "Open Full Web Geo Hub",
    refresh: "Refresh Context",
    cityLabel: "Target City",
    industryLabel: "Service Industry",
    customIndustryLabel: "Custom Industry Name",
    customIndustryPlaceholder: "e.g. Solar Panels, Auto Detailing",
    radiusLabel: "Radius (km)",
    currencyLabel: "Currency",
    applyParams: "Apply Parameters",
    loading: "Loading Jira & Confluence workspace context...",
    loadError: "Could not load workspace context",
    tabWorkspace: "Workspace & Benchmarks",
    tabCalculator: "Zone Quote Calculator",
    tabAutomation: "Confluence & Jira Actions",
    jiraSectionTitle: "Live Jira Project Context",
    confluenceSectionTitle: "Live Confluence Space Context",
    coverageTitle: "Active Coverage Zone",
    coverageTownsLabel: "Serviceable towns in radius",
    noIssues: "No issues found in this project yet.",
    noPages: "No Confluence pages found in this space yet.",
    confluenceUnavailable: "Confluence space unavailable",
    colKey: "Key",
    colSummary: "Summary",
    colType: "Type",
    colStatus: "Status",
    colService: "Service",
    colOurPrice: "Target Price",
    colMarketAvg: "Market Avg",
    colGap: "Gap",
    benchmarksTitle: "Industry Pricing Benchmarks",
    painPointsTitle: "Priority Customer Pain Points",
    customIndustryNote:
      "Custom niche mode active — benchmark table will appear once synced via the Web Geo Hub.",
    townLabel: "Service Town",
    distanceLabel: "Distance from Center (km)",
    orderValueLabel: "Base Order Value",
    serviceNameLabel: "Service Label",
    serviceNameDefault: "Standard Local Service",
    computeQuote: "Calculate Zone Quote",
    createQuoteIssue: "Create Quote Ticket in Jira",
    quoteSummaryTitle: "Calculated Zone Quote",
    inZone: "Inside Standard Zone",
    outOfZone: "Out-of-Zone Surcharge",
    travelFeeLabel: "Travel Fee",
    driveTimeLabel: "Est. Drive Time",
    totalLabel: "Total Quote",
    quoteCreatedTitle: "Quote ticket created in Jira",
    openIssue: "Open Issue",
    publishTitle: "Publish Strategy Playbook to Confluence",
    playbookSummaryLabel: "Executive Strategy Summary",
    playbookSummaryDefault:
      "Localized pricing alignment, transparent zone travel fees, and fast-turnaround service positioning.",
    spaceKeyLabel: "Confluence Space Key (auto-detected if empty)",
    spaceKeyPlaceholder: "Auto-detect active space",
    publishBtn: "Publish Playbook",
    campaignTitle: "Create Expansion Campaign in Jira",
    campaignNameLabel: "Campaign Title",
    campaignNameDefault: "Regional Expansion Campaign",
    campaignActionsLabel: "Action Items (semicolon-separated)",
    campaignActionsDefault:
      "Audit top 5 local competitors; Update zone pricing matrix; Launch local district outreach",
    createCampaignBtn: "Create Jira Epic & Tasks",
    actionSuccessTitle: "Atlassian action completed",
    tasksCreatedWord: "tasks created",
    openPage: "Open Page",
    industryOptions: [
      { label: "Upholstery & Carpet Cleaning", value: "upholstery" },
      { label: "HVAC & Heat Pump Service", value: "hvac" },
      { label: "Plumbing & Hydraulics", value: "plumbing" },
      { label: "Custom Service Niche", value: "custom" },
    ],
  },
  pl: {
    title: "Northstar Ops",
    subtitle: "Geo-inteligencja, wycena strefowa i automatyzacja Atlassian",
    runsBadge: "Runs on Atlassian · Zero Egress",
    openWebHub: "Otwórz pełny Web Geo Hub",
    refresh: "Odśwież kontekst",
    cityLabel: "Miasto docelowe",
    industryLabel: "Branża usługowa",
    customIndustryLabel: "Nazwa własnej branży",
    customIndustryPlaceholder: "np. Fotowoltaika, Auto Detailing",
    radiusLabel: "Promień (km)",
    currencyLabel: "Waluta",
    applyParams: "Zastosuj parametry",
    loading: "Wczytywanie żywego kontekstu z Jiry i Confluence...",
    loadError: "Nie udało się pobrać kontekstu przestrzeni roboczej",
    tabWorkspace: "Kontekst i Benchmarki",
    tabCalculator: "Kalkulator Wyceny Strefowej",
    tabAutomation: "Akcje Confluence i Jira",
    jiraSectionTitle: "Żywy kontekst projektu Jira",
    confluenceSectionTitle: "Żywy kontekst przestrzeni Confluence",
    coverageTitle: "Aktywna strefa zasięgu",
    coverageTownsLabel: "Miejscowości obsługiwane w promieniu",
    noIssues: "Brak zgłoszeń w tym projekcie.",
    noPages: "Brak stron w tej przestrzeni Confluence.",
    confluenceUnavailable: "Przestrzeń Confluence niedostępna",
    colKey: "Klucz",
    colSummary: "Podsumowanie",
    colType: "Typ",
    colStatus: "Status",
    colService: "Usługa",
    colOurPrice: "Nasza stawka",
    colMarketAvg: "Śr. rynkowa",
    colGap: "Różnica",
    benchmarksTitle: "Benchmarki cenowe branży",
    painPointsTitle: "Główne problemy klientów na rynku",
    customIndustryNote:
      "Tryb własnej niszy — pełna tabela porównawcza pojawi się po skanowaniu w Web Geo Hubie.",
    townLabel: "Miejscowość usługi",
    distanceLabel: "Odległość od bazy (km)",
    orderValueLabel: "Wartość bazowa zlecenia",
    serviceNameLabel: "Nazwa usługi",
    serviceNameDefault: "Usługa lokalna (standard)",
    computeQuote: "Policz wycenę strefową",
    createQuoteIssue: "Zapisz wycenę jako zadanie w Jira",
    quoteSummaryTitle: "Wyliczona wycena strefowa",
    inZone: "W standardowej strefie",
    outOfZone: "Dopłata poza strefą",
    travelFeeLabel: "Koszt dojazdu",
    driveTimeLabel: "Szac. czas dojazdu",
    totalLabel: "Suma wyceny",
    quoteCreatedTitle: "Utworzono zadanie wyceny w Jira",
    openIssue: "Otwórz zadanie",
    publishTitle: "Opublikuj playbook strategiczny w Confluence",
    playbookSummaryLabel: "Podsumowanie strategii",
    playbookSummaryDefault:
      "Dopasowanie cennika do rynku lokalnego, jawne opłaty strefowe i szybka realizacja zleceń.",
    spaceKeyLabel: "Klucz przestrzeni Confluence (auto-wykrywany gdy pusty)",
    spaceKeyPlaceholder: "Wykryj automatycznie aktywną przestrzeń",
    publishBtn: "Publikuj w Confluence",
    campaignTitle: "Utwórz kampanię ekspansji w Jira",
    campaignNameLabel: "Nazwa kampanii",
    campaignNameDefault: "Regionalna kampania ekspansji",
    campaignActionsLabel: "Zadania do utworzenia (oddzielone średnikiem)",
    campaignActionsDefault:
      "Audyt 5 lokalnych konkurentów; Aktualizacja cennika strefowego; Kampania w okolicznych miejscowościach",
    createCampaignBtn: "Utwórz Epik i zadania w Jira",
    actionSuccessTitle: "Akcja Atlassian zakończona sukcesem",
    tasksCreatedWord: "utworzonych zadań",
    openPage: "Otwórz stronę",
    industryOptions: [
      { label: "Pranie dywanów i tapicerki", value: "upholstery" },
      { label: "Klimatyzacja i pompy ciepła (HVAC)", value: "hvac" },
      { label: "Hydraulika i CO", value: "plumbing" },
      { label: "Własna branża usługowa", value: "custom" },
    ],
  },
};

const RADIUS_OPTIONS = [10, 20, 30, 50, 75, 100].map((km) => ({
  label: `${km} km`,
  value: String(km),
}));

const CURRENCY_OPTIONS = ["PLN", "USD", "EUR", "GBP"].map((code) => ({
  label: code,
  value: code,
}));

function App() {
  const productContext = useProductContext();
  const activeProjectKey = productContext?.extension?.project?.key || "KAN";
  const initializedProjectRef = useRef(null);

  const [locale, setLocale] = useState("en");
  const t = COPY[locale];

  const [city, setCity] = useState("Radom");
  const [industryPreset, setIndustryPreset] = useState("upholstery");
  const [customIndustry, setCustomIndustry] = useState("");
  const [radiusKm, setRadiusKm] = useState("30");
  const [currency, setCurrency] = useState("PLN");

  const [workspaceData, setWorkspaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [quoteTown, setQuoteTown] = useState("Pionki");
  const [quoteDistanceKm, setQuoteDistanceKm] = useState("22");
  const [quoteOrderValue, setQuoteOrderValue] = useState("250");
  const [quoteServiceLabel, setQuoteServiceLabel] = useState(
    COPY.en.serviceNameDefault,
  );
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteCreated, setQuoteCreated] = useState(null);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const [spaceKeyInput, setSpaceKeyInput] = useState("");
  const [playbookSummary, setPlaybookSummary] = useState(
    COPY.en.playbookSummaryDefault,
  );
  const [campaignName, setCampaignName] = useState(COPY.en.campaignNameDefault);
  const [campaignActions, setCampaignActions] = useState(
    COPY.en.campaignActionsDefault,
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  const resolveEffectiveIndustry = useCallback((preset, customVal) => {
    if (preset === "custom") {
      return customVal.trim() || "Local Field Service";
    }
    return preset;
  }, []);

  const effectiveIndustry = useMemo(
    () => resolveEffectiveIndustry(industryPreset, customIndustry),
    [industryPreset, customIndustry, resolveEffectiveIndustry],
  );

  const fetchWorkspace = useCallback(
    async (overrides = {}, options = {}) => {
      const quiet = Boolean(options.quiet);
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMsg(null);

      const nextCity = (overrides.city ?? city).trim() || "Radom";
      const nextPreset = overrides.industryPreset ?? industryPreset;
      const nextCustom = overrides.customIndustry ?? customIndustry;
      const nextIndustry = resolveEffectiveIndustry(nextPreset, nextCustom);
      const nextRadius = Number(overrides.radiusKm ?? radiusKm) || 30;
      const nextCurrency = overrides.currency ?? currency;
      const nextSpaceKey = (overrides.spaceKey ?? spaceKeyInput).trim();

      try {
        const data = await invoke("getProjectWorkspaceData", {
          city: nextCity,
          industry: nextIndustry,
          radiusKm: nextRadius,
          currency: nextCurrency,
          projectKey: activeProjectKey,
          spaceKey: nextSpaceKey,
        });
        setWorkspaceData(data);

        const detectedSpaceKey =
          data?.atlassianWorkspace?.confluenceSpace?.key || "";
        if (!nextSpaceKey && detectedSpaceKey) {
          setSpaceKeyInput(detectedSpaceKey);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t.loadError);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      city,
      industryPreset,
      customIndustry,
      radiusKm,
      currency,
      spaceKeyInput,
      activeProjectKey,
      resolveEffectiveIndustry,
      t.loadError,
    ],
  );

  useEffect(() => {
    if (productContext && initializedProjectRef.current !== activeProjectKey) {
      initializedProjectRef.current = activeProjectKey;
      fetchWorkspace();
    }
  }, [productContext, activeProjectKey, fetchWorkspace]);

  const handleApplyParameters = async () => {
    const cleanCity = city.trim() || "Radom";
    const isRadom = cleanCity.toLowerCase() === "radom";
    if (
      !isRadom &&
      (quoteTown.trim().toLowerCase() === "pionki" || !quoteTown.trim())
    ) {
      setQuoteTown(cleanCity);
      setQuoteDistanceKm("0");
      setQuoteResult(null);
    }
    await fetchWorkspace({ city: cleanCity });
  };

  const handleToggleLocale = (nextLocale) => {
    setLocale(nextLocale);
    if (quoteServiceLabel === COPY[locale].serviceNameDefault) {
      setQuoteServiceLabel(COPY[nextLocale].serviceNameDefault);
    }
    if (playbookSummary === COPY[locale].playbookSummaryDefault) {
      setPlaybookSummary(COPY[nextLocale].playbookSummaryDefault);
    }
    if (campaignName === COPY[locale].campaignNameDefault) {
      setCampaignName(COPY[nextLocale].campaignNameDefault);
    }
    if (campaignActions === COPY[locale].campaignActionsDefault) {
      setCampaignActions(COPY[nextLocale].campaignActionsDefault);
    }
  };

  const handleCalculateQuote = async () => {
    setQuoteBusy(true);
    setErrorMsg(null);
    setQuoteCreated(null);
    try {
      const distNum = Number(quoteDistanceKm);
      const res = await invoke("calculateQuote", {
        town: quoteTown,
        orderValue: Number(quoteOrderValue) || 0,
        radiusKm: Number(radiusKm) || 30,
        currency,
        ...(Number.isFinite(distNum) && quoteDistanceKm.trim() !== ""
          ? { distanceKm: distNum }
          : {}),
      });
      setQuoteResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.loadError);
    } finally {
      setQuoteBusy(false);
    }
  };

  const handleCreateQuoteTicket = async () => {
    setQuoteBusy(true);
    setErrorMsg(null);
    try {
      const distNum = Number(quoteDistanceKm);
      const res = await invoke("createQuoteTicket", {
        projectKey: activeProjectKey,
        serviceLabel: quoteServiceLabel,
        town: quoteTown,
        orderValue: Number(quoteOrderValue) || 0,
        radiusKm: Number(radiusKm) || 30,
        currency,
        ...(Number.isFinite(distNum) && quoteDistanceKm.trim() !== ""
          ? { distanceKm: distNum }
          : {}),
      });
      setQuoteCreated(res);
      setQuoteResult(res.quote);
      await fetchWorkspace({}, { quiet: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.loadError);
    } finally {
      setQuoteBusy(false);
    }
  };

  const handlePublishPlaybook = async () => {
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const cleanCity = city.trim() || "Radom";
      const res = await invoke("publishPlaybook", {
        title: `${t.title} Playbook: ${cleanCity} (${radiusKm} km)`,
        city: cleanCity,
        industry: effectiveIndustry,
        radiusKm: Number(radiusKm) || 30,
        currency,
        spaceKey: spaceKeyInput.trim(),
        summary: playbookSummary,
      });
      setActionResult({ type: "confluence", data: res });
      if (res?.spaceKey) {
        setSpaceKeyInput(res.spaceKey);
      }
      await fetchWorkspace(
        { spaceKey: res?.spaceKey || spaceKeyInput },
        { quiet: true },
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.loadError);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateCampaign = async () => {
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const cleanCity = city.trim() || "Radom";
      const res = await invoke("createCampaign", {
        campaignTitle: `${campaignName} (${cleanCity})`,
        city: cleanCity,
        industry: effectiveIndustry,
        actionItems: campaignActions,
        projectKey: activeProjectKey,
      });
      setActionResult({ type: "jira", data: res });
      await fetchWorkspace({}, { quiet: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.loadError);
    } finally {
      setActionBusy(false);
    }
  };

  const jiraIssues = workspaceData?.atlassianWorkspace?.recentJiraIssues || [];
  const confluenceSpace = workspaceData?.atlassianWorkspace?.confluenceSpace;
  const confluencePages =
    workspaceData?.atlassianWorkspace?.recentConfluencePages || [];
  const benchmarks = workspaceData?.pricingBenchmarks || [];
  const painPoints = workspaceData?.topCustomerPainPoints || [];
  const townDetails = workspaceData?.townDetails || [];

  const issuesHead = {
    cells: [
      { key: "key", content: t.colKey },
      { key: "summary", content: t.colSummary },
      { key: "type", content: t.colType },
      { key: "status", content: t.colStatus },
    ],
  };

  const issuesRows = jiraIssues.map((issue) => ({
    key: issue.key,
    cells: [
      {
        key: `${issue.key}-k`,
        content: (
          <Button
            appearance="link"
            spacing="none"
            onClick={() => router.navigate(issue.browsePath)}
          >
            {issue.key}
          </Button>
        ),
      },
      { key: `${issue.key}-s`, content: issue.summary },
      { key: `${issue.key}-t`, content: issue.issueType },
      {
        key: `${issue.key}-st`,
        content: <Lozenge appearance="inprogress">{issue.status}</Lozenge>,
      },
    ],
  }));

  const benchHead = {
    cells: [
      { key: "svc", content: t.colService },
      { key: "our", content: t.colOurPrice },
      { key: "avg", content: t.colMarketAvg },
      { key: "gap", content: t.colGap },
    ],
  };

  const benchRows = benchmarks.map((b, idx) => {
    const gapPct =
      b.marketAvg > 0
        ? Math.round(((b.ourPrice - b.marketAvg) / b.marketAvg) * 100)
        : 0;
    return {
      key: `bench-${idx}`,
      cells: [
        { key: `svc-${idx}`, content: b.name },
        { key: `our-${idx}`, content: `${b.ourPrice} ${b.currency}` },
        { key: `avg-${idx}`, content: `${b.marketAvg} ${b.currency}` },
        {
          key: `gap-${idx}`,
          content: (
            <Lozenge appearance={gapPct <= 0 ? "success" : "moved"}>
              {`${gapPct > 0 ? "+" : ""}${gapPct}%`}
            </Lozenge>
          ),
        },
      ],
    };
  });

  return (
    <Stack space="space.250">
      <Box xcss={cardStyle}>
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Stack space="space.050">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Heading as="h1">{t.title}</Heading>
              <Lozenge appearance="success">{t.runsBadge}</Lozenge>
              <Lozenge appearance="inprogress">{activeProjectKey}</Lozenge>
            </Inline>
            <Text>{t.subtitle}</Text>
          </Stack>
          <Inline space="space.100" alignBlock="center">
            <Button
              appearance={locale === "en" ? "primary" : "subtle"}
              onClick={() => handleToggleLocale("en")}
            >
              EN
            </Button>
            <Button
              appearance={locale === "pl" ? "primary" : "subtle"}
              onClick={() => handleToggleLocale("pl")}
            >
              PL
            </Button>
            <Button
              appearance="default"
              onClick={() => router.open(WEB_HUB_URL)}
            >
              {t.openWebHub}
            </Button>
          </Inline>
        </Inline>
      </Box>

      <Box xcss={cardStyle}>
        <Stack space="space.150">
          <Inline space="space.150" alignBlock="end" shouldWrap>
            <Stack space="space.050">
              <Label labelFor="ns-city">{t.cityLabel}</Label>
              <Textfield
                id="ns-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="ns-industry">{t.industryLabel}</Label>
              <Select
                inputId="ns-industry"
                options={t.industryOptions}
                value={t.industryOptions.find(
                  (o) => o.value === industryPreset,
                )}
                onChange={(opt) => {
                  const nextPreset = opt?.value || "upholstery";
                  setIndustryPreset(nextPreset);
                  if (nextPreset !== "custom") {
                    fetchWorkspace({ industryPreset: nextPreset });
                  }
                }}
              />
            </Stack>
            {industryPreset === "custom" && (
              <Stack space="space.050">
                <Label labelFor="ns-custom-ind">{t.customIndustryLabel}</Label>
                <Textfield
                  id="ns-custom-ind"
                  placeholder={t.customIndustryPlaceholder}
                  value={customIndustry}
                  onChange={(e) => setCustomIndustry(e.target.value)}
                />
              </Stack>
            )}
            <Stack space="space.050">
              <Label labelFor="ns-radius">{t.radiusLabel}</Label>
              <Select
                inputId="ns-radius"
                options={RADIUS_OPTIONS}
                value={RADIUS_OPTIONS.find((o) => o.value === radiusKm)}
                onChange={(opt) => {
                  const nextRadius = opt?.value || "30";
                  setRadiusKm(nextRadius);
                  fetchWorkspace({ radiusKm: nextRadius });
                }}
              />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="ns-currency">{t.currencyLabel}</Label>
              <Select
                inputId="ns-currency"
                options={CURRENCY_OPTIONS}
                value={CURRENCY_OPTIONS.find((o) => o.value === currency)}
                onChange={(opt) => {
                  const nextCurrency = opt?.value || "PLN";
                  setCurrency(nextCurrency);
                  fetchWorkspace({ currency: nextCurrency });
                }}
              />
            </Stack>
            <Button
              appearance="primary"
              isDisabled={loading || refreshing}
              onClick={handleApplyParameters}
            >
              {t.applyParams}
            </Button>
          </Inline>
        </Stack>
      </Box>

      {errorMsg && (
        <SectionMessage appearance="error" title={t.loadError}>
          <Text>{errorMsg}</Text>
        </SectionMessage>
      )}

      {loading ? (
        <Inline space="space.100" alignBlock="center">
          <Spinner size="medium" />
          <Text>{t.loading}</Text>
        </Inline>
      ) : (
        <Tabs id="northstar-tabs">
          <TabList>
            <Tab>{t.tabWorkspace}</Tab>
            <Tab>{t.tabCalculator}</Tab>
            <Tab>{t.tabAutomation}</Tab>
          </TabList>

          <TabPanel>
            <Box xcss={fullWidthBox}>
              <Stack space="space.200">
                <Box xcss={cardStyle}>
                  <Stack space="space.100">
                    <Inline spread="space-between" alignBlock="center">
                      <Heading as="h2">{t.jiraSectionTitle}</Heading>
                      <Button
                        appearance="subtle"
                        isDisabled={refreshing}
                        onClick={() => fetchWorkspace({}, { quiet: true })}
                      >
                        {t.refresh}
                      </Button>
                    </Inline>
                    <DynamicTable
                      head={issuesHead}
                      rows={issuesRows}
                      emptyView={<Text>{t.noIssues}</Text>}
                    />
                  </Stack>
                </Box>

                <Box xcss={cardStyle}>
                  <Stack space="space.100">
                    <Inline space="space.100" alignBlock="center" shouldWrap>
                      <Heading as="h2">{t.confluenceSectionTitle}</Heading>
                      {confluenceSpace?.key && (
                        <Lozenge appearance="default">
                          {confluenceSpace.key}
                        </Lozenge>
                      )}
                    </Inline>
                    {confluenceSpace?.error ? (
                      <SectionMessage
                        appearance="warning"
                        title={t.confluenceUnavailable}
                      >
                        <Text>{confluenceSpace.error}</Text>
                      </SectionMessage>
                    ) : confluencePages.length === 0 ? (
                      <Text>{t.noPages}</Text>
                    ) : (
                      <Stack space="space.075">
                        {confluencePages.map((page) => (
                          <Inline
                            key={page.id}
                            spread="space-between"
                            alignBlock="center"
                          >
                            <Text>{page.title}</Text>
                            {page.webPath && (
                              <Button
                                appearance="link"
                                onClick={() => router.navigate(page.webPath)}
                              >
                                {t.openPage}
                              </Button>
                            )}
                          </Inline>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Box>

                {workspaceData && (
                  <Box xcss={cardStyle}>
                    <Stack space="space.100">
                      <Inline space="space.100" alignBlock="center" shouldWrap>
                        <Heading as="h2">{t.coverageTitle}</Heading>
                        <Lozenge appearance="inprogress">
                          {`${workspaceData.city} · ${workspaceData.targetRadiusKm} km`}
                        </Lozenge>
                      </Inline>
                      <Text>{workspaceData.geoCoverageNote}</Text>
                      {townDetails.length > 0 && (
                        <Stack space="space.050">
                          <Text>{t.coverageTownsLabel}</Text>
                          <Inline space="space.075" shouldWrap>
                            {townDetails.map((town) => (
                              <Lozenge key={town.name} appearance="default">
                                {`${town.name} (${town.distKm} km · ${town.travelFee} ${town.currency})`}
                              </Lozenge>
                            ))}
                          </Inline>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                )}

                <Box xcss={cardStyle}>
                  <Stack space="space.100">
                    <Heading as="h2">{t.benchmarksTitle}</Heading>
                    {benchmarks.length > 0 ? (
                      <DynamicTable head={benchHead} rows={benchRows} />
                    ) : (
                      <SectionMessage appearance="information">
                        <Text>{t.customIndustryNote}</Text>
                      </SectionMessage>
                    )}
                    <Heading as="h3">{t.painPointsTitle}</Heading>
                    <Stack space="space.050">
                      {painPoints.map((p, idx) => (
                        <Inline key={idx} space="space.100" alignBlock="center">
                          <Lozenge appearance="moved">{`${p.frequencyPct}%`}</Lozenge>
                          <Text>{p.issue}</Text>
                        </Inline>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            </Box>
          </TabPanel>

          <TabPanel>
            <Box xcss={fullWidthBox}>
              <Stack space="space.200">
                <Box xcss={cardStyle}>
                  <Stack space="space.150">
                    <Heading as="h2">{t.tabCalculator}</Heading>
                    <Inline space="space.150" shouldWrap>
                      <Stack space="space.050">
                        <Label labelFor="q-svc">{t.serviceNameLabel}</Label>
                        <Textfield
                          id="q-svc"
                          value={quoteServiceLabel}
                          onChange={(e) => setQuoteServiceLabel(e.target.value)}
                        />
                      </Stack>
                      <Stack space="space.050">
                        <Label labelFor="q-town">{t.townLabel}</Label>
                        <Textfield
                          id="q-town"
                          value={quoteTown}
                          onChange={(e) => setQuoteTown(e.target.value)}
                        />
                      </Stack>
                      <Stack space="space.050">
                        <Label labelFor="q-dist">{t.distanceLabel}</Label>
                        <Textfield
                          id="q-dist"
                          type="number"
                          value={quoteDistanceKm}
                          onChange={(e) => setQuoteDistanceKm(e.target.value)}
                        />
                      </Stack>
                      <Stack space="space.050">
                        <Label labelFor="q-val">
                          {`${t.orderValueLabel} (${currency})`}
                        </Label>
                        <Textfield
                          id="q-val"
                          type="number"
                          value={quoteOrderValue}
                          onChange={(e) => setQuoteOrderValue(e.target.value)}
                        />
                      </Stack>
                    </Inline>
                    <Inline space="space.100" shouldWrap>
                      <Button
                        appearance="default"
                        isDisabled={quoteBusy}
                        onClick={handleCalculateQuote}
                      >
                        {t.computeQuote}
                      </Button>
                      <Button
                        appearance="primary"
                        isDisabled={quoteBusy}
                        onClick={handleCreateQuoteTicket}
                      >
                        {t.createQuoteIssue}
                      </Button>
                    </Inline>
                    {quoteResult && (
                      <SectionMessage
                        appearance={
                          quoteResult.inStandardZone ? "success" : "warning"
                        }
                        title={`${t.quoteSummaryTitle} — ${quoteResult.town}`}
                      >
                        <Stack space="space.050">
                          <Inline space="space.100" alignBlock="center">
                            <Lozenge
                              appearance={
                                quoteResult.inStandardZone ? "success" : "moved"
                              }
                            >
                              {quoteResult.inStandardZone
                                ? t.inZone
                                : t.outOfZone}
                            </Lozenge>
                            <Text>{`${quoteResult.distanceKm} km · ${t.driveTimeLabel}: ~${quoteResult.estimatedDriveMin} min`}</Text>
                          </Inline>
                          <Text>{`${t.travelFeeLabel}: ${quoteResult.travelFee} ${quoteResult.currency} | ${t.totalLabel}: ${quoteResult.total} ${quoteResult.currency}`}</Text>
                        </Stack>
                      </SectionMessage>
                    )}
                    {quoteCreated?.ok && (
                      <SectionMessage
                        appearance="success"
                        title={`${t.quoteCreatedTitle}: ${quoteCreated.key}`}
                      >
                        <Inline space="space.100" alignBlock="center">
                          <Text>{quoteCreated.summary}</Text>
                          <Button
                            appearance="link"
                            onClick={() =>
                              router.navigate(quoteCreated.browsePath)
                            }
                          >
                            {t.openIssue}
                          </Button>
                        </Inline>
                      </SectionMessage>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Box>
          </TabPanel>

          <TabPanel>
            <Box xcss={fullWidthBox}>
              <Stack space="space.200">
                <Box xcss={cardStyle}>
                  <Stack space="space.150">
                    <Heading as="h2">{t.publishTitle}</Heading>
                    <Box xcss={fullWidthBox}>
                      <Stack space="space.050">
                        <Label labelFor="cf-space">{t.spaceKeyLabel}</Label>
                        <Textfield
                          id="cf-space"
                          placeholder={t.spaceKeyPlaceholder}
                          value={spaceKeyInput}
                          onChange={(e) => setSpaceKeyInput(e.target.value)}
                        />
                      </Stack>
                    </Box>
                    <Box xcss={fullWidthBox}>
                      <Stack space="space.050">
                        <Label labelFor="cf-sum">
                          {t.playbookSummaryLabel}
                        </Label>
                        <TextArea
                          id="cf-sum"
                          minimumRows={3}
                          value={playbookSummary}
                          onChange={(e) => setPlaybookSummary(e.target.value)}
                        />
                      </Stack>
                    </Box>
                    <Inline space="space.100">
                      <Button
                        appearance="primary"
                        isDisabled={actionBusy}
                        onClick={handlePublishPlaybook}
                      >
                        {t.publishBtn}
                      </Button>
                    </Inline>
                  </Stack>
                </Box>

                <Box xcss={cardStyle}>
                  <Stack space="space.150">
                    <Heading as="h2">{t.campaignTitle}</Heading>
                    <Box xcss={fullWidthBox}>
                      <Stack space="space.050">
                        <Label labelFor="jr-name">{t.campaignNameLabel}</Label>
                        <Textfield
                          id="jr-name"
                          value={campaignName}
                          onChange={(e) => setCampaignName(e.target.value)}
                        />
                      </Stack>
                    </Box>
                    <Box xcss={fullWidthBox}>
                      <Stack space="space.050">
                        <Label labelFor="jr-acts">
                          {t.campaignActionsLabel}
                        </Label>
                        <TextArea
                          id="jr-acts"
                          minimumRows={3}
                          value={campaignActions}
                          onChange={(e) => setCampaignActions(e.target.value)}
                        />
                      </Stack>
                    </Box>
                    <Inline space="space.100">
                      <Button
                        appearance="primary"
                        isDisabled={actionBusy}
                        onClick={handleCreateCampaign}
                      >
                        {t.createCampaignBtn}
                      </Button>
                    </Inline>
                  </Stack>
                </Box>

                {actionResult && (
                  <SectionMessage
                    appearance="success"
                    title={t.actionSuccessTitle}
                  >
                    {actionResult.type === "confluence" ? (
                      <Inline space="space.100" alignBlock="center">
                        <Text>{`${actionResult.data.title} (${actionResult.data.spaceKey})`}</Text>
                        {actionResult.data.webPath && (
                          <Button
                            appearance="link"
                            onClick={() =>
                              router.navigate(actionResult.data.webPath)
                            }
                          >
                            {t.openPage}
                          </Button>
                        )}
                      </Inline>
                    ) : (
                      <Inline space="space.100" alignBlock="center" shouldWrap>
                        <Text>{`${actionResult.data.projectKey}: ${actionResult.data.createdCount} ${t.tasksCreatedWord}`}</Text>
                        {actionResult.data.epicIssue && (
                          <Button
                            appearance="link"
                            onClick={() =>
                              router.navigate(
                                actionResult.data.epicIssue.browsePath,
                              )
                            }
                          >
                            {actionResult.data.epicIssue.key}
                          </Button>
                        )}
                      </Inline>
                    )}
                  </SectionMessage>
                )}
              </Stack>
            </Box>
          </TabPanel>
        </Tabs>
      )}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
