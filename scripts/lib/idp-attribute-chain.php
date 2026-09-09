<?php
/**
 * What a login would actually release, measured through the CONFIGURED filter
 * chain. Piped into `php` inside manifest-idp by scripts/verify.sh.
 *
 * This exists because asserting that `core:AttributeLimit` is LOADED passes
 * just as happily when the priorities are swapped and the limit therefore
 * matches nothing (the plan's own self-review, item 3). Building the chain from
 * `authproc.idp` in priority order makes the ordering visible here rather than
 * only in a completed login.
 *
 * Five attributes go in, the SP row declares two, and the two that come out
 * must be named by the OIDs passport-ubcshib maps.
 */
require '/var/simplesamlphp/vendor/autoload.php';

$ap = \SimpleSAML\Configuration::getInstance()->getOptionalArray('authproc.idp', []);
ksort($ap, SORT_NUMERIC);

$sp = [
    'entityid'   => 'https://manifest.internal/sp/verify-chain-probe/staging',
    'attributes' => ['ubcEduCwlPuid', 'mail'],
];
$state = [
    'Attributes' => [
        'ubcEduCwlPuid'        => ['stu000001'],
        'mail'                 => ['s@ubc.ca'],
        'givenName'            => ['Test'],
        'sn'                   => ['Student'],
        'eduPersonAffiliation' => ['student'],
    ],
    'Destination' => $sp,
    'Source'      => ['entityid' => 'https://idp.manifest.internal/idp/shibboleth'],
];

foreach ($ap as $p) {
    $cfg  = is_array($p) ? $p : ['class' => $p];
    $name = $cfg['class'];
    // ProcessingChain strips these before constructing a filter; leaving `class`
    // in makes AttributeLimit throw on its own class name.
    unset($cfg['class'], $cfg['%priority']);
    [$mod, $cls] = explode(':', $name, 2);
    $fq = "\\SimpleSAML\\Module\\{$mod}\\Auth\\Process\\{$cls}";
    if (!class_exists($fq)) {
        continue;
    }
    $f = new $fq($cfg, null);
    $f->process($state);
}

$keys = array_keys($state['Attributes']);
sort($keys);
echo implode(',', $keys), "\n";
