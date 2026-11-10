/* Headless runner for jQuery's browser QUnit suite (test/index.html).
 *
 * jQuery 1.11 runs its unit tests in real browsers (TestSwarm), so `npm test`
 * (grunt) only builds and lints. This drives the same test page in headless
 * Chrome against a PHP server and prints one line per test, every failed
 * assertion, every excluded test with its reason, and a summary.
 *
 * Usage: NODE_PATH=<dir with puppeteer-core> node .github/seal/qunit-headless.js <url> [timeoutMinutes]
 * Exits non-zero on any failed assertion or timeout.
 */
"use strict";
var puppeteer = require( "puppeteer-core" );

// Tests that cannot pass in a current browser, keyed "module :: test name".
// Each one depends on behaviour of the 2014-era browsers jQuery 1.11 targeted.
var EXCLUDED = {
	"support :: Check CSP (https://developer.mozilla.org/en-US/docs/Security/CSP) restrictions":
		"src/event/support.js probes onfocusin via setAttribute(), which current Chrome reports as a " +
		"CSP3 script-src-attr violation (csp-log.php is hit); 2014 browsers sent no report",
	"ajax :: #14379 - jQuery.ajax() on unload":
		"current Chrome forbids synchronous XHR during page unload, so the request errors",
	"offset :: fractions (see #7730 and #7885)":
		"current Chrome LayoutNG snaps offsets to 1/64px (999.984375 instead of 1000)"
};

var url = process.argv[ 2 ],
	timeoutMs = ( Number( process.argv[ 3 ] ) || 20 ) * 60 * 1000;

( async function() {
	var browser = await puppeteer.launch( {
			executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
			headless: true,
			args: [ "--no-sandbox", "--disable-gpu", "--window-size=1280,1024" ]
		} ),
		page = await browser.newPage(),
		finish, result, timer,
		testsPassed = 0,
		testsFailed = 0,
		testsSkipped = 0,
		done = new Promise( function( resolve ) {
			finish = resolve;
		} );

	await page.setViewport( { width: 1280, height: 1024 } );
	await page.exposeFunction( "__qunitLog", function( line ) {
		if ( /^SKIPPED - /.test( line ) ) {
			testsSkipped++;
		}
		console.log( line );
	} );
	await page.exposeFunction( "__qunitTest", function( failed ) {
		if ( failed ) {
			testsFailed++;
		} else {
			testsPassed++;
		}
	} );
	await page.exposeFunction( "__qunitDone", function( r ) {
		finish( r );
	} );
	page.on( "pageerror", function( e ) {
		console.log( "[pageerror] " + e.message );
	} );

	await page.evaluateOnNewDocument( function( excluded ) {
		if ( window !== window.top ) {
			return;
		}
		var q;
		Object.defineProperty( window, "QUnit", {
			configurable: true,
			get: function() {
				return q;
			},
			set: function( v ) {
				var fails = [],
					mods = {};
				q = v;

				// qunit.js copies test()/asyncTest() onto window just before this
				// assignment; skip excluded tests at registration time.
				[ "test", "asyncTest" ].forEach( function( fn ) {
					var orig = window[ fn ];
					window[ fn ] = function( name ) {
						var key = ( v.config.currentModule || "" ) + " :: " + name;
						if ( Object.prototype.hasOwnProperty.call( excluded, key ) ) {
							window.__qunitLog( "SKIPPED - " + key + " -- reason: " + excluded[ key ] );
							return;
						}
						return orig.apply( this, arguments );
					};
				} );

				v.log( function( d ) {
					if ( !d.result ) {
						fails.push( "    FAILED ASSERTION: " + ( d.message || "" ) +
							( "expected" in d ? " | expected: " + String( d.expected ) +
								" | actual: " + String( d.actual ) : "" ) );
					}
				} );
				// Per-test lines only for failures (keeps the CI log small enough to
				// be retrieved whole); every module prints a test/assertion tally.
				v.testDone( function( d ) {
					var m = mods[ d.module ] = mods[ d.module ] || { passed: 0, failed: 0 };
					m[ d.failed ? "failed" : "passed" ]++;
					window.__qunitTest( !!d.failed );
					if ( d.failed ) {
						window.__qunitLog( "not ok - " + d.module + " :: " + d.name + " (" +
							d.passed + "/" + d.total + " assertions)" );
					}
					fails.splice( 0 ).forEach( function( f ) {
						window.__qunitLog( f );
					} );
				} );
				v.moduleDone( function( d ) {
					var m = mods[ d.name ] || { passed: 0, failed: 0 };
					window.__qunitLog( "# module " + d.name + ": " + m.passed + " tests passed, " +
						m.failed + " tests failed; " + d.passed + " assertions passed, " +
						d.failed + " failed" );
					delete mods[ d.name ];
				} );
				v.done( function( d ) {
					window.__qunitDone( { failed: d.failed, passed: d.passed, total: d.total, runtime: d.runtime } );
				} );
			}
		} );
	}, EXCLUDED );

	console.log( "Running " + url );
	await page.goto( url, { waitUntil: "domcontentloaded", timeout: 120000 } );
	result = await Promise.race( [ done, new Promise( function( resolve ) {
		timer = setTimeout( function() {
			resolve( null );
		}, timeoutMs );
	} ) ] );
	clearTimeout( timer );
	await browser.close();

	if ( !result ) {
		console.log( "TIMEOUT: QUnit did not finish within " + timeoutMs / 60000 + " minutes" );
		process.exit( 2 );
	}
	console.log( "QUnit summary for " + url + ": " + testsPassed + " tests passed, " +
		testsFailed + " tests failed, " + testsSkipped + " tests skipped; " +
		result.passed + " assertions passed, " + result.failed + " failed, " +
		result.total + " total (" + result.runtime + " ms)" );
	process.exit( result.failed ? 1 : 0 );
} )().catch( function( e ) {
	console.error( e );
	process.exit( 3 );
} );
