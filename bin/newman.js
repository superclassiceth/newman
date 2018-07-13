#!/usr/bin/env node

require('../lib/node-version-check'); // @note that this should not respect CLI --silent

const _ = require('lodash'),
    waterfall = require('async/waterfall'),
    program = require('commander'),
    version = require('../package.json').version,
    newman = require('../'),
    util = require('./util');

program
    .version(version, '-v, --version')
    .name('newman');

// The `run` command allows you to specify a collection to be run with the provided options.
program
    .command('run <collection>')
    .description('URL or path to a Postman Collection.')
    .usage('<collection> [options]')
    .option('-e, --environment <path>', 'Specify a URL or Path to a Postman Environment.')
    .option('-g, --globals <path>', 'Specify a URL or Path to a file containing Postman Globals.')
    .option('--folder <path>', 'Run a single folder from a collection.')
    .option('-r, --reporters [reporters]', 'Specify the reporters to use for this run.', util.cast.csvParse, ['cli'])
    .option('-n, --iteration-count <n>', 'Define the number of iterations to run.', util.cast.integer)
    .option('-d, --iteration-data <path>', 'Specify a data file to use for iterations (either json or csv).')
    .option('--export-environment <path>', 'Exports the environment to a file after completing the run.')
    .option('--export-globals <path>', 'Specify an output file to dump Globals before exiting.')
    .option('--export-collection <path>', 'Specify an output file to save the executed collection')
    .option('--delay-request [n]', 'Specify the extent of delay between requests (milliseconds)', util.cast.integer, 0)
    .option('--bail [modifiers]',
        'Specify whether or not to gracefully stop a collection run on encountering an error' +
        'and whether to end the run with an error based on the optional modifier.', util.cast.csvParse)
    .option('-x , --suppress-exit-code',
        'Specify whether or not to override the default exit code for the current run.')
    .option('--silent', 'Prevents newman from showing output to CLI.')
    .option('--disable-unicode',
        'Forces unicode compliant symbols to be replaced by their plain text equivalents')
    .option('--global-var <value>',
        'Allows the specification of global variables via the command line, in a key=value format',
        util.cast.memoize, [])
    .option('--color', 'Force colored output (for use in CI environments).')
    .option('--no-color', 'Disable colored output.', false)
    .option('--timeout [n]', 'Specify a timeout for collection run (in milliseconds)', util.cast.integer, 0)
    .option('--timeout-request [n]', 'Specify a timeout for requests (in milliseconds).', util.cast.integer, 0)
    .option('--timeout-script [n]', 'Specify a timeout for script (in milliseconds).', util.cast.integer, 0)
    .option('--ignore-redirects', 'If present, Newman will not follow HTTP Redirects.')
    .option('-k, --insecure', 'Disables SSL validations.')
    .option('--ssl-client-cert <path>',
        'Specify the path to the Client SSL certificate. Supports .cert and .pfx files.')
    .option('--ssl-client-key <path>',
        'Specify the path to the Client SSL key (not needed for .pfx files)')
    .option('--ssl-client-passphrase <path>',
        'Specify the Client SSL passphrase (optional, needed for passphrase protected keys).')
    .action((collection, command) => {
        let options = util.commanderToObject(command),

            // parse custom reporter options
            reporterOptions = util.parseNestedOptions(program._originalArgs, '--reporter-', options.reporters);

        // Inject additional properties into the options object
        options.collection = collection;
        options.reporterOptions = reporterOptions._generic;
        options.reporter = _.transform(_.omit(reporterOptions, '_generic'), (acc, value, key) => {
            acc[key] = _.assignIn(value, reporterOptions._generic); // overrides reporter options with _generic
        }, {});

        newman.run(options, function (err, summary) {
            const runError = err || summary.run.error || summary.run.failures.length;

            err && console.error(`\n  error: ${err.message || err}\n`);
            runError && !_.get(options, 'suppressExitCode') && process.exit(1);
        });
    });

// Warn on invalid command and then exits.
program.on('command:*', (command) => {
    console.error(`\n  error: invalid command \`${command}\`\n`);
    program.help();
});

/**
 * Starts the script execution.
 * callback is required when this is required as a module in tests.
 *
 * @param {String[]} argv - Argument vector.
 * @param {?Function} callback - The callback function invoked on the completion of execution.
 */
function run (argv, callback) {
    waterfall([
        (next) => {
            // cache original argv, required to parse nested options later.
            program._originalArgs = argv;
            // omit custom nested options, otherwise commander will throw unknown options error
            next(null, util.omitNestedOptions(argv, '--reporter-'));
        },
        (args, next) => {
            try {
                program.parse(args);
            }
            catch (error) {
                return next(error);
            }
            next(null);
        },
        (next) => {
            // throw error if no argument is provided.
            const error = !program.args.length && new Error('no arguments provided');

            next(error ? error : null);
        }
    ], (error) => {
        // invoke callback if this is required as module, used in tests.
        if (callback) { return callback(error); }

        // in case of an error, log error message and print help message.
        if (error) {
            console.error(`\n  error: ${error.message || error}\n`);
            program.help();
        }
    });
}

// This hack has been added from https://github.com/nodejs/node/issues/6456#issue-151760275
// @todo: remove when https://github.com/nodejs/node/issues/6456 has been fixed
(Number(process.version[1]) >= 6) && [process.stdout, process.stderr].forEach((s) => {
    s && s.isTTY && s._handle && s._handle.setBlocking && s._handle.setBlocking(true);
});

// Run this script if this is a direct stdin.
!module.parent && run(process.argv);

// Export to allow debugging and testing.
module.exports = run;
