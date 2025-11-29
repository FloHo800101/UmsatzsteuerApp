import '@testing-library/jest-dom'

// Polyfills for common browser APIs used by some components
declare global {
	interface Window {
		matchMedia?: (query: string) => MediaQueryList
	}
}

if (typeof window.matchMedia !== 'function') {
	window.matchMedia = (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	} as unknown as MediaQueryList)
}

