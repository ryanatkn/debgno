export const generate_mozilla_sources = (): string => `Types: deb
URIs: https://packages.mozilla.org/apt
Suites: mozilla
Components: main
Signed-By: /etc/apt/keyrings/packages.mozilla.org.asc
`;

export const generate_mozilla_pin = (): string => `Package: firefox firefox-l10n-*
Pin: origin packages.mozilla.org
Pin-Priority: 1000
`;

export const generate_policies_json = (): string =>
	JSON.stringify(
		{
			policies: {
				DisableTelemetry: true,
				DisablePocket: true,
				DisableFirefoxAccounts: true,
				OfferToSaveLogins: false,
				AutofillAddressEnabled: false,
				AutofillCreditCardEnabled: false,
				HttpsOnlyMode: 'force_enabled',
				EnableTrackingProtection: {
					Value: true,
					Locked: true,
					Cryptomining: true,
					Fingerprinting: true,
				},
				DNSOverHTTPS: {
					Enabled: true,
					Locked: true,
					ProviderURL: 'https://mozilla.cloudflare-dns.com/dns-query',
				},
				FirefoxSuggest: {
					WebSuggestions: false,
					SponsoredSuggestions: false,
					ImproveSuggest: false,
					Locked: true,
				},
				UserMessaging: {
					WhatsNew: false,
					ExtensionRecommendations: false,
					FeatureRecommendations: false,
					UrlbarInterventions: false,
					SkipOnboarding: true,
					MoreFromMozilla: false,
					Locked: true,
				},
				DisableFirefoxStudies: true,
				OverrideFirstRunPage: '',
				OverridePostUpdatePage: '',
				Homepage: {
					StartPage: 'previous-session',
				},
				SearchEngines: {
					Default: 'DuckDuckGo',
					// exact display names from search-config-v2; DuckDuckGo (default) and
					// Wikipedia (en) are kept
					Remove: ['Google', 'Amazon.com', 'Bing', 'eBay', 'Perplexity'],
				},
				GenerativeAI: {
					Enabled: false,
					Locked: false,
				},
				// umbrella "Block AI enhancements" switch — AI blocked by default but left
				// unlocked so users can re-enable (incl. on-device translations); pairs with
				// GenerativeAI/browser.ml.enable, which are likewise default-off, not forced
				AIControls: {
					Default: {
						Value: 'blocked',
						Locked: false,
					},
				},
				PictureInPicture: {
					Enabled: false,
				},
				SearchSuggestEnabled: false,
				// section-wide lock relaxed so Search and Shortcuts stay user-toggleable
				// (both default on). Weather and the privacy-sensitive feeds (sponsored,
				// stories, snippets/"Support Firefox" messages) are handled via
				// Preferences below — weather uses the showWeather pref rather than the
				// FirefoxHome.Weather policy key, which only exists in Firefox 152+
				FirefoxHome: {
					Search: true,
					TopSites: true,
					Highlights: true,
					Locked: false,
				},
				ExtensionSettings: {
					'uBlock0@raymondhill.net': {
						installation_mode: 'force_installed',
						install_url:
							'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi',
					},
					// Amazon and eBay are revenue-partner search engines that resist
					// SearchEngines.Remove, so also block them as add-ons (mkaply's documented
					// workaround). Exact ids shifted with the search-config-v2 migration, so a
					// couple of likely forms are listed; unknown ids are ignored
					'amazondotcom-us@search.mozilla.org': {installation_mode: 'blocked'},
					'amazondotcom@search.mozilla.org': {installation_mode: 'blocked'},
					'ebay@search.mozilla.org': {installation_mode: 'blocked'},
				},
				Preferences: {
					'browser.ml.enable': {Value: false, Status: 'default'},
					// weather: locked off. Status:'default' didn't stick — the activity-stream
					// feature keeps its own baked default and re-checks the toggle — so it has
					// to be forced to honor "uncheck weather"
					'browser.newtabpage.activity-stream.showWeather': {Value: false, Status: 'locked'},
					// other new tab content off by default but left user-toggleable, not
					// forced: widgets (lists/timer/clock) and snippets/"Support Firefox" messages
					'browser.newtabpage.activity-stream.widgets.system.enabled': {
						Value: false,
						Status: 'default',
					},
					'browser.newtabpage.activity-stream.feeds.snippets': {Value: false, Status: 'default'},
					// sponsored content stays locked off; recommended stories are also held
					// off here and via DisablePocket above
					'browser.newtabpage.activity-stream.showSponsoredTopSites': {
						Value: false,
						Status: 'locked',
					},
					'browser.newtabpage.activity-stream.showSponsored': {Value: false, Status: 'locked'},
					'browser.newtabpage.activity-stream.feeds.section.topstories': {
						Value: false,
						Status: 'locked',
					},
					// shortcuts rows: 3 (default 1), left user-changeable
					'browser.newtabpage.activity-stream.topSitesRows': {Value: 3, Status: 'default'},
					'browser.newtabpage.activity-stream.section.highlights.includeVisited': {
						Value: false,
						Status: 'default',
					},
					'browser.newtabpage.activity-stream.section.highlights.includeDownloads': {
						Value: false,
						Status: 'default',
					},
					'browser.newtabpage.activity-stream.section.highlights.includeBookmarks': {
						Value: true,
						Status: 'default',
					},
					'browser.newtabpage.activity-stream.section.highlights.rows': {
						Value: 4,
						Status: 'default',
					},
					'browser.urlbar.suggest.engines': {Value: false, Status: 'locked'},
					'signon.management.page.breach-alerts.enabled': {Value: false, Status: 'locked'},
					'network.IDN_show_punycode': {Value: true, Status: 'locked'},
					'browser.tabs.crashReporting.sendReport': {Value: false, Status: 'locked'},
					'browser.translations.automaticallyPopup': {Value: false, Status: 'locked'},
					'browser.aboutConfig.showWarning': {Value: false, Status: 'default'},
				},
			},
		},
		null,
		2,
	) + '\n';
