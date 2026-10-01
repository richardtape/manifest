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
        //
        // `uid` is the CWL login name — the name each user types above — which the
        // control plane asks for since the front-end enablement plan's Task 7, so an
        // owner can add a colleague by it (§9 as Spec action 4 amended it).
        'student:student' => [
            'ubcEduCwlPuid'        => ['stu000001'],
            'uid'                  => ['student'],
            'mail'                 => ['student@student.ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Student'],
            'eduPersonAffiliation' => ['student'],
        ],
        'instructor:instructor' => [
            'ubcEduCwlPuid'        => ['ins000001'],
            'uid'                  => ['instructor'],
            'mail'                 => ['instructor@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Instructor'],
            'eduPersonAffiliation' => ['faculty'],
        ],
        // The launch path plan's Task 8a (FE-39, Decision 31): a SECOND FACULTY MEMBER. Since FE-39
        // only a person who may build — faculty, or an administrator — is added to a project, so a
        // demo that adds a colleague adds this one; `student` is shown refused MEMBER_MAY_NOT_BUILD.
        'colleague:colleague' => [
            'ubcEduCwlPuid'        => ['col000001'],
            'uid'                  => ['colleague'],
            'mail'                 => ['colleague@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Colleague'],
            'eduPersonAffiliation' => ['faculty'],
        ],
        // P5a Task 16: a person to make a platform ADMINISTRATOR with scripts/admin-grant.sh,
        // so the journey can read the fleet (§26) without changing what the student and the
        // instructor prove in every other demo. Friendly names, as above.
        'operator:operator' => [
            'ubcEduCwlPuid'        => ['opr000001'],
            'uid'                  => ['operator'],
            'mail'                 => ['operator@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Operator'],
            'eduPersonAffiliation' => ['staff'],
        ],
    ],
];
