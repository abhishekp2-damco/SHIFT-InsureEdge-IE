// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Layout wrapper for the Quotes & Policies landing pages (register grids) plus the
// WizardSidebar used by the New Submission wizard. Ported from the prototype's
// components/QuotesPoliciesLandingShell.tsx + WizardSidebar (originally in App.tsx).
import { useEffect, useState } from 'react';
import { ChevronRight, FileCheck2, FileClock, FilePenLine, FileText, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { policyStatusLabel } from '../../utils/policyStatus';
import { authApi } from '../../api/auth';
import { useIsProducer } from '../../hooks/useIsProducer';
import { isParentRouteActive } from '../../utils/activeRoute';
import './QuotesPolicies.css';

type ActionItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  match?: string[];
};

const sections: Array<{ title: string; items: ActionItem[] }> = [
  {
    title: 'Individual',
    items: [
      { label: 'New Business Quote', to: '/quotes-policies/individual/nb-quotes', icon: FilePenLine },
      { label: 'Endorsement Quote', to: '/quotes-policies/individual/endorsements', icon: FileText },
      { label: 'Renewal Quote', to: '/quotes-policies/individual/renewals', icon: FileClock },
      { label: 'Policies', to: '/quotes-policies/individual/policies', icon: FileCheck2 },
    ],
  },
];

const businessSection: { title: string; items: ActionItem[] } = {
  title: 'Business',
  items: [
    { label: 'New Business Quote', to: '/quotes-policies/business/nb-quotes', icon: FilePenLine },
    { label: 'Endorsement Quote', to: '/quotes-policies/business/endorsements', icon: FileText },
    { label: 'Renewal Quote', to: '/quotes-policies/business/renewals', icon: FileClock },
    { label: 'Policies', to: '/quotes-policies/business/policies', icon: FileCheck2 },
  ],
};

const recentActivity = [
  'Submission viewed for Quote ID 0000003752',
  'Submission viewed for Quote ID 0000003753',
  'Submission viewed for Quote ID 0000003750',
  'Submission viewed for Quote ID 0000000059',
  'Policy viewed for Policy ID 0000000728',
];

function ActionsToggleIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="m2.5 5.5 3.5 3.5-3.5 3.5M8 5h7.5M8 9h7.5M8 13h7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2.5 5h7.5M2.5 9H10M2.5 13H10m5.5-7.5L12 9l3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function QuotesPoliciesLandingShell() {
  const location = useLocation();
  const linkedProducer = useIsProducer();
  // QP-06: the New Submission landing (Producer & Product Details) keeps the Actions panel;
  // the wizard itself has its own sidebar.
  const searchParams = new URLSearchParams(location.search);
  const isSubmissionLanding = searchParams.get('landing') === '1';
  const submissionInsuredType = searchParams.get('insuredType')?.toLowerCase() === 'business' ? 'business' : 'individual';
  const isNewSubmissionLanding = location.pathname === '/quotes-policies/submissions/new' && isSubmissionLanding;
  const hideLandingActions = location.pathname.startsWith('/quotes-policies/submissions') && !isSubmissionLanding;
  // QP-01: the hamburger collapses / expands the Actions panel.
  const [collapsed, setCollapsed] = useState(false);
  const [hasProducerRole, setHasProducerRole] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Individual: true,
    Business: true,
  });

  useEffect(() => {
    if (!isNewSubmissionLanding || linkedProducer !== false) return;

    let cancelled = false;
    authApi.getMyProfile()
      .then(profile => {
        if (!cancelled) {
          setHasProducerRole(String(profile.roleName || '').toLowerCase().includes('producer'));
        }
      })
      .catch(() => {
        if (!cancelled) setHasProducerRole(false);
      });

    return () => { cancelled = true; };
  }, [isNewSubmissionLanding, linkedProducer]);

  // Some Producer-role users do not have a linked Producer row, so retain the
  // profile-role fallback used by the New Submission form itself.
  const hideRecentActivity = isNewSubmissionLanding && (linkedProducer === true || hasProducerRole);
  const showProducerSubmissionActions = hideRecentActivity;
  const visibleSections = showProducerSubmissionActions ? [...sections, businessSection] : sections;

  return (
    <div className="qp-scope" style={{ height: '100%' }}>
      <div className="app-body" style={{ height: '100%' }}>
        {!hideLandingActions && (
          <aside className={`sidebar landing-actions-sidebar${showProducerSubmissionActions ? ' producer-submission-actions' : ''}${collapsed ? ' sidebar-collapsed' : ''}`}>
            <div className="sidebar-header">
              {!collapsed && <span>Actions</span>}
              <button className="sidebar-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand Actions menu' : 'Collapse Actions menu'} title={collapsed ? 'Expand Actions' : 'Collapse Actions'} onClick={() => setCollapsed(c => !c)}>
                <ActionsToggleIcon collapsed={collapsed} />
              </button>
            </div>

            {collapsed ? (
              <button className="sidebar-collapsed-strip" type="button" onClick={() => setCollapsed(false)} aria-label="Expand Actions menu">
                <span className="sidebar-collapsed-label">Actions</span>
              </button>
            ) : (
              <div className="landing-actions-content">
                {visibleSections.map(section => {
                  const sectionOpen = !showProducerSubmissionActions || openSections[section.title] !== false;
                  const sectionHeader = showProducerSubmissionActions ? (
                    <button
                      className="nav-section-header"
                      type="button"
                      aria-expanded={sectionOpen}
                      onClick={() => setOpenSections(current => ({ ...current, [section.title]: !sectionOpen }))}
                    >
                      <ChevronRight size={13} className={`nav-section-chevron${sectionOpen ? ' open' : ''}`} />
                      <span>{section.title}</span>
                    </button>
                  ) : (
                    <div className="nav-section-header">
                      <ChevronRight size={13} className="nav-section-chevron open" />
                      <span>{section.title}</span>
                    </div>
                  );

                  return (
                    <div className={showProducerSubmissionActions ? 'nav-accordion' : undefined} key={section.title}>
                      {sectionHeader}
                      {sectionOpen && section.items.map(({ label, to, icon: Icon, match }) => {
                        const newSubmissionItemActive = showProducerSubmissionActions
                          && label === 'New Business Quote'
                          && section.title.toLowerCase() === submissionInsuredType;
                        const moduleActive = newSubmissionItemActive
                          || [to, ...(match ?? [])].some(path => isParentRouteActive(location.pathname, path));

                        return (
                          <NavLink
                            key={`${section.title}-${label}`}
                            to={to}
                            className={({ isActive }) => `nav-item${isActive || moduleActive ? ' active' : ''}`}
                          >
                            <Icon size={14} className="nav-icon" />
                            <span>{label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  );
                })}

                {!hideRecentActivity && (
                  <div className="recent-activity">
                    <div className="recent-activity-title">Recent Activity</div>
                    {recentActivity.map(item => (
                      <div className="activity-item" key={item}>
                        <div>
                          <div className="act-label">View</div>
                          <div className="act-text">{item}</div>
                        </div>
                        <span className="act-arrow">&#8250;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        <main className={`main${location.pathname.startsWith('/quotes-policies/submissions') ? ' main-fullwidth' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ─── Avatar helpers (used by the register grids for the insured-name avatar chip) ──
const INSURED_AVATAR_BACKGROUND = '#7fc1e2';

export function avatarColor(_name: string) {
  return INSURED_AVATAR_BACKGROUND;
}

export function initials(name: string) {
  return name.split(' ').filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Wizard sidebar (used by NewSubmission) ──────────────────────────────────
type StepStatus = 'done' | 'active' | 'pending';

interface WizardSidebarProps {
  submissionId: string;
  status: string;
  currentStep: number;
  onStepClick: (n: number) => void;
  screenCode?: string;
  recordLabel?: string;
  maxNavigableStep?: number;
}

export function WizardSidebar({ submissionId, status, currentStep, onStepClick, screenCode = '', recordLabel = 'Submission', maxNavigableStep }: WizardSidebarProps) {
  const normalizedScreenCode = String(screenCode).toUpperCase();
  const isEndorsement = normalizedScreenCode.startsWith('ENDORSEMENT');
  const isRenewal = normalizedScreenCode.startsWith('RENEWAL');
  const isPolicy = normalizedScreenCode.startsWith('POLICY');
  const showLimits = !isEndorsement && !isRenewal;
  const showUWSpecificChange = isRenewal;
  const orderedSteps = [
    0,
    1,
    2,
    ...(showLimits ? [3] : []),
    4,
    ...(showUWSpecificChange ? [8] : []),
    5,
    6,
    7,
  ];
  const currentIndex = orderedSteps.indexOf(currentStep);
  const currentStatus = status || 'Draft';
  // QP-01: the hamburger collapses / expands the wizard sidebar.
  const [collapsed, setCollapsed] = useState(false);
  const canNavigate = (step: number) => maxNavigableStep == null || step <= maxNavigableStep;

  const stepStatus = (step: number): StepStatus => {
    if (step === currentStep) return 'active';
    const index = orderedSteps.indexOf(step);
    if (index === -1 || currentIndex === -1) return step < currentStep ? 'done' : 'pending';
    return index < currentIndex ? 'done' : 'pending';
  };

  function StepCircle({ state }: { state: StepStatus }) {
    return <div className={`step-circle ${state}`}>{state === 'done' && <span>&#10003;</span>}</div>;
  }

  const mainSteps = [{ n: 0, label: 'Policy Information' }];
  const riskSubSteps = [
    { n: 1, label: 'Location' },
    { n: 2, label: 'Risk Information' },
    ...(showLimits ? [{ n: 3, label: 'Limits & Coverages' }] : []),
    { n: 4, label: 'Plans Overview' },
    ...(showUWSpecificChange ? [{ n: 8, label: 'UW Specific Change' }] : []),
  ];
  const lateSteps = [
    { n: 5, label: 'Quote Review' },
    { n: 6, label: 'Finalize Quote' },
    { n: 7, label: 'Documents' },
  ];
  const riskState: StepStatus = riskSubSteps.some(step => step.n === currentStep)
    ? 'active'
    : riskSubSteps.every(step => stepStatus(step.n) === 'done')
      ? 'done'
      : 'pending';

  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <span>{recordLabel}</span>
        <button className="sidebar-toggle" type="button" title={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(c => !c)}>&#8801;</button>
      </div>
      <div className="submission-sidebar">
        <div className="submission-id-box">{isPolicy ? submissionId : `ID - ${submissionId}`}</div>
        <div className="submission-status">
          Status: <span className={`badge badge-${currentStatus.toLowerCase().replace(/\s+/g, '-')}`}><span className="badge-dot" />{policyStatusLabel(currentStatus)}</span>
        </div>

        <div className="step-list">
          {mainSteps.map(step => (
            <div key={step.n} onClick={() => canNavigate(step.n) && onStepClick(step.n)} aria-disabled={!canNavigate(step.n)} style={{ cursor: canNavigate(step.n) ? 'pointer' : 'not-allowed' }}>
              <div className="step-item">
                <StepCircle state={stepStatus(step.n)} />
                <span className={`step-label ${stepStatus(step.n)}`}>{step.label}</span>
              </div>
              <div className="step-connector dashed" />
            </div>
          ))}

          <div className="step-item" style={{ cursor: 'default' }}>
            <StepCircle state={riskState} />
            <span className={`step-label ${riskState === 'active' ? 'active' : riskState === 'done' ? 'done' : ''}`}>Risk</span>
          </div>

          {riskSubSteps.map((step, index) => (
            <div key={step.n} onClick={() => canNavigate(step.n) && onStepClick(step.n)} aria-disabled={!canNavigate(step.n)} style={{ cursor: canNavigate(step.n) ? 'pointer' : 'not-allowed', opacity: canNavigate(step.n) ? 1 : 0.65 }}>
              <div className="step-item" style={{ paddingLeft: 32 }}>
                <StepCircle state={stepStatus(step.n)} />
                <span className={`step-label ${stepStatus(step.n)}`}>{step.label}</span>
              </div>
              {index < riskSubSteps.length - 1 && <div className="step-connector dashed" style={{ marginLeft: 40 }} />}
            </div>
          ))}
          <div className="step-connector dashed" />

          {lateSteps.map(step => (
            <div key={step.n} onClick={() => canNavigate(step.n) && onStepClick(step.n)} aria-disabled={!canNavigate(step.n)} style={{ cursor: canNavigate(step.n) ? 'pointer' : 'not-allowed', opacity: canNavigate(step.n) ? 1 : 0.65 }}>
              <div className="step-item">
                <StepCircle state={stepStatus(step.n)} />
                <span className={`step-label ${stepStatus(step.n)}`}>{step.label}</span>
              </div>
              {step.n < 7 && <div className="step-connector dashed" />}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
