<?php
// D6: the Manifest IdP serves TEST USERS ONLY and never authenticates a real
// person. Its signing key never touches a real identity, which is what keeps it
// off the top of §3.5's asset list.
$config = [
    'admin' => ['core:AdminPassword'],
    'manifest-test-users' => [
        'exampleauth:UserPass',
        // FRIENDLY NAMES HERE, OIDs ON THE WIRE. This is not a preference; it is
        // what makes §9's "an app cannot receive an attribute it did not declare"
        // true. MEASURED 2026-09-08 against this exact SimpleSAMLphp:
        //
        //   auth source OID keys   + row declares friendly  -> releases NOTHING
        //   auth source friendly   + row declares friendly  -> releases the two
        //   auth source friendly   + row declares []        -> releases ALL
        //
        // core:AttributeLimit compares the row's `attributes` list against the
        // attribute KEYS as they stand at priority 50, and a manifest.yaml's
        // `auth.attributes` are friendly names. So the auth source speaks
        // friendly, AttributeLimit matches it, and core:AttributeMap at 60
        // converts to the OIDs real UBC Shibboleth sends (S2) — which is how a
        // sandbox exercises production's attribute vocabulary.
        'student:student' => [
            'ubcEduCwlPuid'        => ['stu000001'],
            'mail'                 => ['student@student.ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Student'],
            'eduPersonAffiliation' => ['student'],
        ],
        'instructor:instructor' => [
            'ubcEduCwlPuid'        => ['ins000001'],
            'mail'                 => ['instructor@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Instructor'],
            'eduPersonAffiliation' => ['faculty'],
        ],
        // P5a Task 16: a person to make a platform ADMINISTRATOR with scripts/admin-grant.sh,
        // so the journey can read the fleet (§26) without changing what the student and the
        // instructor prove in every other demo. Friendly names, as above.
        'operator:operator' => [
            'ubcEduCwlPuid'        => ['opr000001'],
            'mail'                 => ['operator@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Operator'],
            'eduPersonAffiliation' => ['staff'],
        ],
    ],
];
