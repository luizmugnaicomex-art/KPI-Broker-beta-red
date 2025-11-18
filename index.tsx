/*
  Fixing a series of syntax errors.
  The original file had a preamble of non-code text which was causing a
  primary parsing failure. Removing this text resolves the initial error.
  
  Additionally, the parser was incorrectly flagging ES6 template literals
  (e.g., `${...}%`) as errors. This is likely a secondary effect of the
  initial parse failure. Replacing these template literals with standard
  string concatenation (`... + '%'`) works around this linter issue and
  allows the file to be parsed correctly.
*/
import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
// FIX: Import the default `firebase` export to access Firebase types like `firebase.User`.
import firebase, { auth, firestore, FieldValue, firebaseConfig } from './firebase';
import { Chart } from 'chart.js/auto';

declare var XLSX: any;


// --- ENHANCED TYPE DEFINITIONS ---

// Enums for Statuses
enum ImportStatus {
    OrderPlaced = 'ORDER PLACED',
    ShipmentConfirmed = 'SHIPMENT CONFIRMED',
    DocumentReview = 'DOCUMENT REVIEW',
    InProgress = 'IN TRANSIT',
    AtPort = 'AT THE PORT',
    DiRegistered = 'DI REGISTERED',
    CargoReady = 'CARGO READY',
    CustomsClearance = 'CARGO CLEARED',
    Delivered = 'CARGO DELIVERED',
    Empty = 'VAZIAS',
}

enum PaymentStatus {
    Paid = 'Paid',
    Pending = 'Pending',
    Overdue = 'Overdue',
    Cancelled = 'Cancelled'
}

enum TaskStatus {
    Completed = 'Completed',
    InProgress = 'In Progress',
    Pending = 'Pending'
}


// Detailed Data Models
interface ContainerDetail {
    id: string;
    seaportArrivalDate?: string;
    demurrageFreeDays?: number;
}

interface Cost {
    description: string;
    value: number;
    currency: 'USD' | 'BRL' | 'EUR' | 'CNY';
    dueDate?: string;
    status: PaymentStatus;
}

// NEW, COMPREHENSIVE SHIPMENT INTERFACE
interface Shipment {
  id: string; // Stable internal identifier
  // Core Identifiers
  blAwb: string;
  poSap?: string;
  invoice?: string;
  
  // Cargo Details
  description?: string;
  typeOfCargo?: string;
  costCenter?: string;
  qtyCarBattery?: number;
  batchChina?: string;
  color?: string;
  exTariff?: 'Yes' | 'No' | '';
  dg?: 'Yes' | 'No' | '';

  // Customs & LI
  uniqueDi?: 'Yes' | 'No' | '';
  liNr?: string;
  statusLi?: string;

  // Responsibilities
  underWater?: 'Yes' | 'No' | '';
  technicianResponsibleChina?: string;
  technicianResponsibleBrazil?: string;

  // Logistics & Container
  shipmentType?: string;
  cbm?: number;
  fcl?: number;
  lcl?: number;
  typeContainer?: string;
  incoterm?: string;
  containerUnloaded?: number;
  freightForwarderDestination?: string;
  
  // Parties
  shipper?: string;
  broker?: string;
  shipowner?: string;
  
  // Dates & Deadlines
  ieSentToBroker?: string;
  freeTime?: number;
  freeTimeDeadline?: string;
  arrivalVessel?: string;
  voyage?: string;
  bondedWarehouse?: string;
  actualEtd?: string;
  actualEta?: string;
  transitTime?: number;
  storageDeadline?: string;
  cargoPresenceDate?: string;
  diRegistrationDate?: string;
  greenChannelOrDeliveryAuthorizedDate?: string;
  nfIssueDate?: string;
  cargoReady?: string;
  firstTruckDelivery?: string;
  lastTruckDelivery?: string;
  invoicePaymentDate?: string;

  // Financials
  invoiceCurrency?: string;
  invoiceValue?: number;
  freightCurrency?: string;
  freightValue?: number;
  vlmd?: string;
  taxRateCny?: number;
  taxRateUsd?: number;
  cifDi?: string;
  nfValuePerContainer?: number;

  // Inspection & Services
  typeOfInspection?: string;
  qtyContainerInspection?: number;
  additionalServices?: string;

  // Documentation & Process
  importPlan?: string;
  importLedger?: string;
  draftDi?: string;
  approvedDraftDi?: string;
  ce?: string;
  damageReport?: 'Yes' | 'No' | '';
  di?: string;
  parametrization?: string;
  draftNf?: string;
  approvedDraftNf?: string;
  nfNacionalization?: string;
  
  // Final Status
  status?: ImportStatus;
  observation?: string;
  
  // Legacy fields for internal logic if needed
  containers: ContainerDetail[];
  costs: Cost[];
}


interface Claim {
    id: string;
    importBl: string;
    status: 'Resolved' | 'Rejected' | 'Open' | 'In Progress';
    amount: number;
}

interface Task {
    id: string;
    description: string;
    assignedToId: string;
    status: TaskStatus;
    dueDate?: string;
}

type UserRole = 'Admin' | 'COMEX' | 'Broker' | 'Logistics' | 'Finance';

interface User {
    id: string; // Corresponds to Firebase Auth UID
    name: string;
    username: string; // This is the user's email
    role: UserRole;
}


interface ExchangeRates {
    date: string;
    time: string;
    usd: { compra: number; venda: number };
    eur: { compra: number; venda: number };
    cny: number;
}


interface Booking {
    time: string;
    containerNumber: string;
    importNumber: string;
    dock: number;
    date: string;
}

type ProcessStatus = 'On Time' | 'Delayed' | 'At Risk' | 'Completed';

interface ProcessTrackingEntry {
  id: string;
  importNum: string;
  blNum: string;
  departure: string;
  arrival: string;
  actualEtd: string;
  eta: string;
  cargoPresence: string;
  diRegistration: string;
  greenChannel: string;
  storageDeadline: string;
  docApproval: string;
  nfIssue: string;
  status: ProcessStatus;
}

type ContainerStatus = 'On Vessel' | 'At Port' | 'In Warehouse' | 'Delivered to Factory' | 'Empty Returned';
interface Container {
    id: string;
    importProcess: string;
    bl: string;
    transitTime: number; // in days
    etaFactory: string;
    status: ContainerStatus;
    location: string; // Warehouse name or 'Unassigned'
}

interface Warehouse {
    name: string;
    capacity: number; // e.g., in TEUs
    currentUsage: number;
}

type ApprovalStatus = 'Pending Approval' | 'Approved' | 'Rejected';

interface BrokerNumerarioEntry {
    id: string;
    importNum: string;
    blNum: string;
    estimatedValue: number;
    informedValue: number;
    approvalStatus: ApprovalStatus;
    transferDate: string;
    reconciliationDate: string;
    paid: boolean;
}

// --- NEW ACCOUNTS PAYABLE INTERFACES ---
interface Fornecedor { id: string; name: string; }
interface Despesa { id: string; category: string; name: string; }
type Currency = 'BRL' | 'USD' | 'CNY';

interface ContaPagar {
    id: string;
    cpNumber: string;
    fornecedorId: string;
    despesaId: string;
    bl: string;
    po: string;
    nf: string;
    migo: string;
    miro: string;
    vencimento: string; // YYYY-MM-DD
    paymentTerm: string;
    valor: number; // Always in BRL
    valorOriginal: number;
    currency: Currency;
    status: 'Pendente' | 'Pago';
    observacoes: string;
    costCenter?: string;
    cargo?: string;
    incoterm?: string;
    diDate?: string;
    sapPo?: string;
}


// --- ICONS ---
const DashboardIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"></path></svg>);
const ImportsIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24"><path d="M20 18v-2h-3v2h3zm-3-4h3v-2h-3v2zm3-4h-3v2h3V6zm-5 2h2v2h-2V8zm-8 4h3v-2H7v2zm3-4H7v2h3V8zm0-4H7v2h3V4zm10 8h-3v2h3v-2zm-3-4h3V8h-3v2zM5 22h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2zM5 4h14v16H5V4z"></path></svg>);
const BackIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>);
const UploadIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="upload-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>);
const CloseIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const EditIcon = () => (<svg viewBox="0 0 24 24" fill="currentColor" style={{width: "1em", height: "1em"}}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>);
const SaveIcon = () => (<svg viewBox="0 0 24 24" fill="currentColor" style={{width: "1em", height: "1em"}}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>);
const CancelIcon = () => (<svg viewBox="0 0 24 24" fill="currentColor" style={{width: "1em", height: "1em"}}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>);
const ContainerIcon = () => (<svg className="header-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 16h2v-4h-2v4zm-3-4H7V4h10v8zm3-6H4c-1.1 0-2 .9-2 2v10h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2V8c0-1.1-.9-2-2-2z"></path></svg>);
const CalendarIcon = () => (<svg className="header-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"></path></svg>);
const ReceiptIcon = () => (<svg className="kpi-metric-icon-svg" viewBox="0 0 24 24"><path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2z"/></svg>);
const ReportIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>);
const KPIsIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z"></path></svg>);
const LogisticsIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm13.5-8.5 1.96 2.5H17V9.5h2.5zM18 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"></path></svg>);
const SettingsIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69-.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12-.64l2 3.46c.12.22.39.3.61.22l2.49 1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49.42l.38-2.65c.61-.25 1.17-.59-1.69-.98l2.49 1c.23.09.49 0 .61.22l2-3.46c.12-.22-.07.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"></path></svg>);
const LogoutIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"></path></svg>);
const UserIcon = () => (<svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>);
const ToggleCollapsedIcon = () => <svg className="toggle-icon" viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6V6z"></path></svg>;
const ToggleExpandedIcon = () => <svg className="toggle-icon" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41zM18 6h-2v12h2V6z"></path></svg>;


// --- UTILITY FUNCTIONS ---
const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        // Add one day to the date to correct for timezone issues
        date.setDate(date.getDate() + 1);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return 'Invalid Date';
    }
};

const excelSerialDateToJSDate = (serial: number) => {
    if (typeof serial !== 'number' || isNaN(serial)) return null;
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
};

const parseDateFromExcel = (value: any): string => {
    if (value === null || typeof value === 'undefined' || value === '') return '';
    if (typeof value === 'number') {
        const date = excelSerialDateToJSDate(value);
        return date ? date.toISOString().split('T')[0] : '';
    }
    if (typeof value === 'string') {
        // Handle 'dd/mm/yyyy' and other potential string formats
        const parts = value.split(/[/.-]/);
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                 // Handle 2-digit years
                const fullYear = year < 100 ? (year > 50 ? 1900 + year : 2000 + year) : year;
                return new Date(fullYear, month, day).toISOString().split('T')[0];
            }
        }
    }
    // Attempt to parse with Date constructor as a fallback
    const parsedDate = new Date(value);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
    }
    return '';
};


const calculateDaysBetween = (start: string | undefined, end: string | undefined): number | null => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};


// --- UI COMPONENTS ---

const TERMINAL_COLOR_MAP = {
    'Intermaritima': '#14b8a6',       // teal-500
    'TPC': '#38bdf8',               // sky-400
    'TECON': '#f43f5e',             // rose-500
    'CLIA Empório': '#f59e0b',       // amber-500
    'N/A': '#6b7280',               // gray-500
    'TECA': '#a78bfa',               // violet-400
};

const LoadingSpinner = () => (
  <div className="loading-spinner">
    <svg className="animate-spin" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3"/>
        <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"/>
    </svg>
  </div>
);


const Modal = ({ children, isOpen, onClose }: { children: React.ReactNode, isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
};


// --- DATA VISUALIZATION COMPONENTS ---

const BarChart = ({ data, onBarClick }) => {
    const chartContainer = useRef(null);

    useEffect(() => {
        if (!chartContainer.current) return;

        const chart = new Chart(chartContainer.current, {
            type: 'bar',
            data: {
                labels: data.map(d => d.status),
                datasets: [{
                    label: 'Imports by Status',
                    data: data.map(d => d.count),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.6)',
                        'rgba(54, 162, 235, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(153, 102, 255, 0.6)',
                        'rgba(255, 159, 64, 0.6)',
                        'rgba(199, 199, 199, 0.6)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(199, 199, 199, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const clickedIndex = elements[0].index;
                        const clickedStatus = data[clickedIndex].status;
                        onBarClick(clickedStatus);
                    }
                }
            }
        });

        return () => chart.destroy();
    }, [data, onBarClick]);

    return (
        <div className="real-chart-container">
            <canvas ref={chartContainer} />
        </div>
    );
};

// FIX: Add a props interface to properly type the component's props, especially `data`.
interface DoughnutChartProps {
    title: string;
    data: {
        label: string;
        value: number;
        secondaryValue?: number;
        color: string;
        shipments: Shipment[];
    }[];
    onSegmentClick?: ((title: string, shipments: Shipment[]) => void) | null;
    size?: number;
    strokeWidth?: number;
}


// FIX: Make onSegmentClick and filterKey optional props by providing default null values.
const DoughnutChart = ({ title, data, onSegmentClick = null, size = 120, strokeWidth = 15 }: DoughnutChartProps) => {
    const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
    const sortedData = useMemo(() => data.filter(d => d.value > 0).sort((a, b) => b.value - a.value), [data]);

    const radius = (size / 2) - strokeWidth;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;

    return (
        <div className="chart-wrapper-full">
            <h4 className="doughnut-title">{title}</h4>
            <div className="doughnut-chart-container">
                <svg className="doughnut-chart-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle
                        className="doughnut-track"
                        cx={size / 2} cy={size / 2} r={radius}
                        strokeWidth={strokeWidth}
                    />
                    {sortedData.map((item) => {
                        const percentage = total > 0 ? (item.value / total) : 0;
                        const segmentLength = circumference * percentage;
                        const currentOffset = offset;
                        offset += segmentLength;

                        return (
                            <circle
                                key={item.label}
                                className="doughnut-segment"
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                strokeDasharray={`${segmentLength} ${circumference}`}
                                strokeDashoffset={-currentOffset}
                                stroke={item.color}
                                strokeWidth={strokeWidth}
                            />
                        );
                    })}
                     <text x={size / 2} y={size / 2} className="doughnut-total" dy=".3em">
                        {total}
                    </text>
                </svg>

                <div className="doughnut-chart-info">
                     <ul className="doughnut-legend">
                        {sortedData.map(item => {
                            const percentage = total > 0 ? (item.value / total * 100).toFixed(0) : 0;
                            const handleClick = () => {
                                if (onSegmentClick) {
                                    onSegmentClick(item.label, item.shipments);
                                }
                            };
                            return (
                                <li key={item.label}>
                                    <button
                                        className="legend-button"
                                        onClick={handleClick}
                                        disabled={!onSegmentClick}
                                        aria-label={`Filter by ${item.label}`}
                                    >
                                        <div className="legend-group">
                                            <span className="legend-marker" style={{ backgroundColor: item.color }}></span>
                                            <span className="legend-label">{item.label}</span>
                                        </div>
                                        <span className="legend-value">
                                            {title === 'DI Channel Parameterization'
                                                ? <>
                                                    {item.value}
                                                    {item.label === 'Red' && typeof item.secondaryValue !== 'undefined' && ` (${item.secondaryValue})`}
                                                  </>
                                                : `${item.value} (${percentage}%)`
                                            }
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
};

// FIX: Add a props interface to properly type the component's props, especially `data`.
interface HorizontalBarChartProps {
    title: string;
    data: {label: string, value: number, shipments: Shipment[]}[];
    onBarClick?: ((title: string, shipments: Shipment[]) => void) | null;
    colorMap: { [key: string]: string };
}

// FIX: Make onBarClick and filterKey optional props by providing default null values.
const HorizontalBarChart = ({ title, data, onBarClick = null, colorMap }: HorizontalBarChartProps) => {
    const totalValue = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
    const sortedData = useMemo(() => data.filter(d => d.value > 0).sort((a, b) => b.value - a.value), [data]);

    return (
        <div className="chart-wrapper-full h-bar-chart-card">
            <h4 className="h-bar-chart-title">{title}</h4>
            <div className="h-bar-chart-body">
                {sortedData.map(item => {
                    const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
                    const handleClick = () => {
                        if (onBarClick) {
                            onBarClick(item.label, item.shipments);
                        }
                    };
                    return (
                        <button
                            key={item.label}
                            className="h-bar-item"
                            onClick={handleClick}
                            disabled={!onBarClick}
                        >
                            <span className="h-bar-label" title={item.label}>{item.label}</span>
                            <div className="h-bar-wrapper">
                                <div
                                    className="h-bar-segment"
                                    style={{ width: percentage + '%', backgroundColor: colorMap[item.label] || 'var(--kpi-accent-blue)' }}
                                ></div>
                                <span className="h-bar-value">{item.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// FIX: Add a 'LineChartProps' interface and apply it to the 'LineChart' component. This fixes multiple downstream TypeScript errors caused by untyped props, including issues with arithmetic operations on potentially undefined values and mapping over arrays of 'unknown' type.
interface LineChartProps {
  title: string;
  subtitle: string;
  data: Array<{value: number, shipments: Shipment[]}>;
  labels: string[];
  goal?: number;
  color: string;
  onMaximize?: (() => void) | null;
  onPointClick?: ((title: string, shipments: Shipment[]) => void) | null;
}

const LineChart = ({ title, subtitle, data, labels, goal, color, onMaximize = null, onPointClick = null }: LineChartProps) => {
    const [tooltip, setTooltip] = useState(null);
    const [viewRange, setViewRange] = useState({ start: 0, end: data.length > 0 ? data.length - 1 : 0 });
    const svgRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        setViewRange({ start: 0, end: data.length > 0 ? data.length - 1 : 0 });
    }, [data]);

    const handleZoomIn = () => {
        setViewRange(prev => {
            const currentRange = prev.end - prev.start;
            if (currentRange < 2) return prev; // Minimum range of 2 points
            const center = prev.start + Math.floor(currentRange / 2);
            const newRange = Math.max(2, Math.ceil(currentRange / 1.5));
            const newStart = Math.max(0, center - Math.floor(newRange / 2));
            const newEnd = Math.min(data.length - 1, newStart + newRange - 1);
            return { start: newStart, end: newEnd };
        });
    };

    const handleZoomOut = () => {
        setViewRange(prev => {
            const currentRange = prev.end - prev.start;
            if (currentRange >= data.length - 1) return prev;
            const center = prev.start + Math.floor(currentRange / 2);
            const newRange = Math.min(data.length, Math.floor(currentRange * 1.5) + 1);
            let newStart = Math.max(0, center - Math.floor(newRange / 2));
            let newEnd = Math.min(data.length - 1, newStart + newRange - 1);
            if (newEnd - newStart + 1 < newRange) {
                newStart = Math.max(0, newEnd - newRange + 1);
            }
            return { start: newStart, end: newEnd };
        });
    };

    const handleResetZoom = () => {
        setViewRange({ start: 0, end: data.length > 0 ? data.length - 1 : 0 });
    };

    const visibleData = useMemo(() => data.slice(viewRange.start, viewRange.end + 1), [data, viewRange]);
    const visibleLabels = useMemo(() => labels.slice(viewRange.start, viewRange.end + 1), [labels, viewRange]);

    const { width, height, margin } = useMemo(() => {
        const container = containerRef.current;
        const w = container ? container.clientWidth : 400;
        const h = container ? container.clientHeight : 200;
        const m = { top: 20, right: 20, bottom: 30, left: 30 };
        return { width: w - m.left - m.right, height: h - m.top - m.bottom, margin: m };
    }, [containerRef.current]);

    const { xScale, yScale, linePath, areaPath, points } = useMemo(() => {
        if (visibleData.length === 0) return { xScale: () => 0, yScale: () => 0, linePath: '', areaPath: '', points: [] };

        const yMax = Math.max(...visibleData.map(d => d.value), goal || 0) * 1.1 || 10;
        const yMin = 0;

        const xScaleFn = (index) => (index / (visibleData.length > 1 ? visibleData.length - 1 : 1)) * width;
        const yScaleFn = (value) => height - ((value - yMin) / (yMax - yMin)) * height;

        const generateLine = (d, i) => `${i === 0 ? 'M' : 'L'} ${xScaleFn(i)} ${yScaleFn(d.value)}`;
        const line = visibleData.map(generateLine).join(' ');

        const area = `${line} V ${height} H ${xScaleFn(0)} Z`;

        const pts = visibleData.map((d, i) => ({
            x: xScaleFn(i),
            y: yScaleFn(d.value),
            value: d.value,
            label: visibleLabels[i],
            shipments: d.shipments,
        }));

        return { xScale: xScaleFn, yScale: yScaleFn, linePath: line, areaPath: area, points: pts };
    }, [visibleData, visibleLabels, width, height, goal]);

    const handleMouseMove = (e, point) => {
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltip({
            ...point,
            x: e.clientX - svgRect.left,
            y: e.clientY - svgRect.top,
        });
    };
    
    const handleWrapperClick = (e) => {
        // Prevent zoom clicks from triggering maximize
        if (e.target.tagName === 'BUTTON' || e.target.closest('.line-chart-point-group')) return;
        if (onMaximize) onMaximize();
    }

    return (
        <div 
            className={`chart-wrapper-full line-chart-card ${onMaximize ? 'clickable' : ''}`}
            onClick={handleWrapperClick}
            role={onMaximize ? 'button' : undefined}
            tabIndex={onMaximize ? 0 : undefined}
            onKeyDown={(e) => {
                if (onMaximize && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onMaximize();
                }
            }}
        >
            <div className="line-chart-header">
                <div>
                    <h4>{title}</h4>
                    <p>{subtitle}</p>
                </div>
                <div className="chart-actions">
                    <button onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In">+</button>
                    <button onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out">-</button>
                    <button onClick={handleResetZoom} title="Reset Zoom" aria-label="Reset Zoom">⟳</button>
                </div>
            </div>
            <div className="line-chart-container" ref={containerRef}>
                {width > 0 && height > 0 && (
                     <svg ref={svgRef} className="line-chart-svg" viewBox={`0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`}>
                        <g transform={`translate(${margin.left},${margin.top})`}>
                            {/* Grid and Axes */}
                            <g className="line-chart-grid">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <line key={i} x1="0" x2={width} y1={i * height / 4} y2={i * height / 4} />
                                ))}
                            </g>
                            <g className="line-chart-axis">
                                {Array.from({ length: 5 }).map((_, i) => {
                                    const yValue = (Math.max(...visibleData.map(d => d.value), goal || 0) * 1.1 || 10) * (1 - i / 4);
                                    return (
                                        <text key={i} x="-10" y={i * height / 4} dy="0.32em" textAnchor="end">{Math.round(yValue)}</text>
                                    );
                                })}
                                {points.map((p, i) => i % Math.ceil(visibleLabels.length / 10) === 0 && (
                                    <text key={i} x={p.x} y={height + 15} textAnchor="middle">{p.label}</text>
                                ))}
                            </g>

                            {/* Goal Line */}
                            {goal && <line className="line-chart-goal" x1="0" x2={width} y1={yScale(goal)} y2={yScale(goal)} />}

                            {/* Area and Line */}
                            <path className="line-chart-area" d={areaPath} style={{ fill: color, opacity: 0.1 }} />
                            <path className="line-chart-line" d={linePath} style={{ stroke: color }} />

                            {/* Points and Tooltips */}
                            {points.map((p, i) => (
                                <g key={i} className="line-chart-point-group"
                                   onClick={() => onPointClick && onPointClick(`${title} in ${p.label}`, p.shipments)}
                                   onMouseMove={(e) => handleMouseMove(e, p)}
                                   onMouseLeave={() => setTooltip(null)}>
                                    <circle className="line-chart-point" cx={p.x} cy={p.y} style={{ stroke: color }} />
                                    <text className="line-chart-data-label" x={p.x} y={p.y - 10} textAnchor="middle">{p.value}</text>
                                </g>
                            ))}
                        </g>
                    </svg>
                )}
                 {tooltip && (
                    <div className="line-chart-tooltip" style={{ left: tooltip.x, top: tooltip.y, opacity: 1, pointerEvents: 'none' }}>
                        <span className="tooltip-label">{tooltip.label}: </span>
                        <span className="tooltip-value">{tooltip.value}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// FIX: Add interface for the data prop to ensure type safety.
interface VerticalBarChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    terminals?: string[];
    shipments?: Shipment[][];
  }>;
}

const VerticalBarChart = ({ title, data, onSegmentClick = null }: { title: string; data: VerticalBarChartData, onSegmentClick?: ((title: string, shipments: Shipment[]) => void) | null }) => {
    if (!data || !data.datasets || data.datasets.length === 0) return <div className="no-data-message">No data for {title}</div>;

    const { labels, datasets } = data;
    // FIX: Explicitly type the accumulator in the reduce function to prevent potential arithmetic type errors.
    const totals = labels.map((_, i) => datasets.reduce((sum: number, ds) => sum + (ds.data[i] || 0), 0));
    const maxTotal = Math.max(...totals) * 1.1 || 10;

    const cargoVolumeLegend = useMemo(() => Object.entries(TERMINAL_COLOR_MAP).map(([label, color]) => ({ label, color })), []);


    return (
        <div className="chart-wrapper-full v-bar-chart-card">
            <h4 className="v-bar-chart-title">{title}</h4>
            <div className="v-bar-chart-container" style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}>
                {/* FIX: Add type to 'label' to prevent it from being inferred as 'unknown'. */}
                {labels.map((label: string, i) => (
                    <div key={label} className="v-bar-group">
                        <div className="v-bar-total">{totals[i]}</div>
                        <div className="v-bar-stack" style={{ height: '150px' }}>
                            {datasets.map(ds => {
                                const value = ds.data[i] || 0;
                                if (value === 0) return null;
                                const height = maxTotal > 0 ? (value / maxTotal) * 100 : 0;
                                const terminal = ds.terminals ? ds.terminals[i] : ds.label;
                                const shipments = ds.shipments ? ds.shipments[i] : [];
                                
                                const handleClick = () => {
                                    if (onSegmentClick && shipments) {
                                        onSegmentClick(`${ds.label} in ${label}`, shipments);
                                    }
                                };

                                return (
                                    <button
                                        key={ds.label + '-' + i}
                                        className="v-bar-segment"
                                        onClick={handleClick}
                                        disabled={!onSegmentClick}
                                        // FIX: Replaced template literal with string concatenation to work around a parser issue.
                                        style={{ height: height + '%', backgroundColor: TERMINAL_COLOR_MAP[terminal] || '#6b7280' }}
                                        title={terminal + ': ' + value}
                                    ></button>
                                );
                            })}
                        </div>
                        <span className="v-bar-label">{label}</span>
                    </div>
                ))}
            </div>
             {title === 'Cargo Volume' && (
                <div className="v-bar-legend">
                    {cargoVolumeLegend.map(item => (
                        <div key={item.label} className="v-bar-legend-item">
                            <span className="legend-marker" style={{ backgroundColor: item.color }}></span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// --- APP PAGES ---

const LoginPage = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // onLoginSuccess will be triggered by the auth state listener in App
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <div className="login-header">
                    <img src="https://i.imgur.com/O9a1Y5B.png" alt="BYD Logo" />
                    <h1>Navigator</h1>
                    <p>International Trade Division 11</p>
                </div>
                <form onSubmit={handleLogin}>
                    {error && <p className="error-message">{error}</p>}
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="login-button" disabled={isLoading}>
                        {isLoading ? <LoadingSpinner /> : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};


const DashboardPage = ({ shipments, onNavigate }) => {
    const [rates, setRates] = useState<ExchangeRates | null>(null);
    
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,CNY-BRL');
                const data = await response.json();
                const now = new Date();
                setRates({
                    date: now.toLocaleDateString('pt-BR'),
                    time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit'}),
                    usd: { compra: parseFloat(data.USDBRL.bid), venda: parseFloat(data.USDBRL.ask) },
                    eur: { compra: parseFloat(data.EURBRL.bid), venda: parseFloat(data.EURBRL.ask) },
                    cny: parseFloat(data.CNYBRL.bid)
                });
            } catch (error) {
                console.error("Failed to fetch exchange rates:", error);
            }
        };
        fetchRates();
    }, []);

    const kpiData = useMemo(() => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);

        const recentShipments = shipments.filter(s => s.actualEta && new Date(s.actualEta) > thirtyDaysAgo);

        // FIX: Explicitly type the accumulator in the reduce function to ensure type safety during arithmetic operations.
        const totalValueRecent = recentShipments.reduce((sum: number, s) => sum + (s.invoiceValue || 0), 0);
        const onTimeShipments = shipments.filter(s => s.status === 'CARGO DELIVERED' && s.actualEta && s.lastTruckDelivery && new Date(s.lastTruckDelivery) <= new Date(s.actualEta)).length;
        const totalDelivered = shipments.filter(s => s.status === 'CARGO DELIVERED').length;
        const onTimePercentage = totalDelivered > 0 ? (onTimeShipments / totalDelivered * 100).toFixed(0) : '0';
        const inTransitCount = shipments.filter(s => s.status === 'IN TRANSIT').length;

        return {
            totalValue: totalValueRecent,
            onTime: onTimePercentage,
            inTransit: inTransitCount,
            totalShipments: shipments.length
        };
    }, [shipments]);

    const statusCounts = useMemo(() => {
        // FIX: Explicitly type `counts` to prevent its values from being inferred as `unknown`.
        const counts: { [key: string]: number } = {};
        Object.values(ImportStatus).forEach(status => {
            counts[status] = 0;
        });
        shipments.forEach(s => {
            if (s.status && counts.hasOwnProperty(s.status)) {
                counts[s.status]++;
            } else if (s.status) {
                counts[s.status] = 1; // Handle statuses not in enum
            }
        });
        return Object.entries(counts)
            .map(([status, count]) => ({ status, count }))
            .filter(item => item.count > 0);
    }, [shipments]);


    const handleBarClick = (status) => {
        // Here you would implement filtering logic, for now, just navigate
        onNavigate('Imports', { statusFilter: status });
    };

    return (
        <div className="dashboard-page">
             <div className="page-header">
                <DashboardIcon />
                <h1>Dashboard</h1>
            </div>
            <p className="page-subtitle">Overview of your import operations.</p>
            
            <div className="kpi-grid">
                 <div className="kpi-card">
                    <div>
                        <div className="kpi-title">Total Shipments</div>
                        <div className="kpi-value">{kpiData.totalShipments}</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div>
                        <div className="kpi-title">In Transit</div>
                        <div className="kpi-value">{kpiData.inTransit}</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div>
                        <div className="kpi-title">On-Time Delivery</div>
                        <div className="kpi-value">{kpiData.onTime}<span className="kpi-unit">%</span></div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div>
                        <div className="kpi-title">Value (Last 30d)</div>
                        <div className="kpi-value">{kpiData.totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div>
                    </div>
                </div>
            </div>
            
            <div className="dashboard-grid">
                <div className="dashboard-card chart-card">
                    <h3 className="card-title">Imports by Status</h3>
                    <BarChart data={statusCounts} onBarClick={handleBarClick} />
                </div>
                <div className="dashboard-card">
                    <h3 className="card-title">Exchange Rates</h3>
                    {rates ? (
                        <div className="rates-content">
                            <p className="rates-updated">Last updated: {rates.date} at {rates.time}</p>
                            <div className="rates-grid">
                                <strong>USD</strong> <span>{rates.usd.compra.toFixed(4)}</span>
                                <strong>EUR</strong> <span>{rates.eur.compra.toFixed(4)}</span>
                                <strong>CNY</strong> <span>{rates.cny.toFixed(4)}</span>
                            </div>
                        </div>
                    ) : <LoadingSpinner />}
                </div>
            </div>
        </div>
    );
};

// --- KPI DASHBOARD PAGES ---

// FIX: Define interfaces for KPI page props to ensure type safety.
interface KpiFilters {
  cargo: string[];
  year: number | 'All';
}

interface KPIPageProps {
  shipments: Shipment[];
  onFilterChange: (filterType: keyof KpiFilters, value: any) => void;
  filters: KpiFilters;
}


const KPIFilterSidebar = ({ shipments, onFilterChange, activeFilters, dateSourceField = 'actualEta' }: { shipments: Shipment[]; onFilterChange: (filterType: keyof KpiFilters, value: any) => void; activeFilters: KpiFilters; dateSourceField?: 'actualEta' | 'diRegistrationDate' }) => {
    const cargoTypes = useMemo(() => {
        const types = new Set(shipments.map(s => s.typeOfCargo).filter(Boolean));
        return Array.from(types).sort();
    }, [shipments]);

    const years = useMemo(() => {
        const yearSet = new Set(
            shipments
                .map(s => {
                    const dateString = dateSourceField === 'diRegistrationDate' ? s.diRegistrationDate : s.actualEta;
                    if (!dateString) return null;
                    const date = new Date(dateString);
                    return isNaN(date.getTime()) ? null : date.getFullYear();
                })
                .filter(y => y && !isNaN(y))
        );
        return Array.from(yearSet).sort((a, b) => b - a);
    }, [shipments, dateSourceField]);

    const handleCargoClick = (cargoType) => {
        const currentSelection = activeFilters.cargo || [];
        const newSelection = currentSelection.includes(cargoType)
            ? currentSelection.filter(c => c !== cargoType)
            : [...currentSelection, cargoType];
        onFilterChange('cargo', newSelection);
    };

    const handleClearCargo = () => {
        onFilterChange('cargo', []);
    };

    const handleYearClick = (year) => {
        onFilterChange('year', year);
    };

    return (
        <aside className="kpi-dashboard-sidebar">
            <div className="kpi-filter-box">
                <h4>Year</h4>
                <div className="cargo-filter-list">
                    <button onClick={() => handleYearClick('All')} className={activeFilters.year === 'All' ? 'active' : ''}>All Years</button>
                    {years.map(year => (
                        <button key={year} onClick={() => handleYearClick(year)} className={activeFilters.year === year ? 'active' : ''}>
                            {year}
                        </button>
                    ))}
                </div>
            </div>
            <div className="kpi-filter-box">
                <h4>Cargo</h4>
                <div className="cargo-filter-list">
                    <button onClick={handleClearCargo} className={!activeFilters.cargo || activeFilters.cargo.length === 0 ? 'active' : ''}>Clear Filters</button>
                    {cargoTypes.map(type => (
                        <button
                            key={type}
                            onClick={() => handleCargoClick(type)}
                            className={activeFilters.cargo?.includes(type) ? 'active' : ''}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
};


// FIX: Add explicit types to function signature to avoid implicit any and improve type safety.
const normalizeTerminalName = (name: string | undefined): string => {
    if (!name) return 'N/A';
    const lowerName = name.toLowerCase();

    // Handle grouping
    if (lowerName.includes('tecon')) return 'TECON'; // Groups TECON and TECON - Wilson Sons
    if (lowerName.includes('teca')) return 'TECA'; // Groups TECA and TECA - SALVADOR

    // Handle specifics
    if (lowerName.includes('clia') && lowerName.includes('empório')) return 'CLIA Empório';
    
    // Handle broader categories
    if (lowerName.includes('intermaritima')) return 'Intermaritima';
    if (lowerName.includes('tpc')) return 'TPC';
    
    return name; // Return original if no match, will default to gray
}

const CargosInTransitDashboard = ({ shipments, onFilterChange, filters }: KPIPageProps) => {
    const [selectedShipments, setSelectedShipments] = useState<{title: string, data: Shipment[]} | null>(null);

    const handleChartClick = (title: string, shipments: Shipment[]) => {
        setSelectedShipments({ title: `Shipments for: ${title}`, data: shipments });
    };
    
    const filteredShipments = useMemo(() => {
        return shipments.filter(s => {
            const cargoMatch = !filters.cargo || filters.cargo.length === 0 || filters.cargo.includes(s.typeOfCargo);
             if (!s.actualEta) return false;
            const shipmentDate = new Date(s.actualEta);
            if (isNaN(shipmentDate.getTime())) return false;
            const yearMatch = filters.year === 'All' || shipmentDate.getFullYear() === filters.year;
            return cargoMatch && yearMatch;
        });
    }, [shipments, filters]);

    // Data for Doughnut charts
    const shipmentsData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = { 'CIF': [], 'FOB': [], 'DAP': [] };
        filteredShipments.forEach(s => {
            if (s.incoterm && groups.hasOwnProperty(s.incoterm)) {
                groups[s.incoterm].push(s);
            }
        });
        return Object.entries(groups).map(([label, shipments]) => ({ label, value: shipments.length, shipments, color: { 'CIF': '#8b5cf6', 'FOB': '#3b82f6', 'DAP': '#ec4899' }[label] }));
    }, [filteredShipments]);
    
    const shipmentStatusData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = { 'Doc Review': [], 'In Transit': [], 'At Port': [] };
        filteredShipments.forEach(s => {
            if (s.status === 'DOCUMENT REVIEW') groups['Doc Review'].push(s);
            if (s.status === 'IN TRANSIT') groups['In Transit'].push(s);
            if (s.status === 'AT THE PORT') groups['At Port'].push(s);
        });
        return Object.entries(groups).map(([label, shipments]) => ({ label, value: shipments.length, shipments, color: { 'Doc Review': '#f97316', 'In Transit': '#3b82f6', 'At Port': '#ef4444' }[label] }));
    }, [filteredShipments]);
    
    const sapPoStatusData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = { 'OK': [], 'Pending': [] };
        filteredShipments.forEach(s => s.poSap ? groups['OK'].push(s) : groups['Pending'].push(s));
        return Object.entries(groups).map(([label, shipments]) => ({ label, value: shipments.length, shipments, color: { 'OK': '#10b981', 'Pending': '#ef4444' }[label] }));
    }, [filteredShipments]);

    const docStatusData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = { 'Approved': [], 'Not Approved': [] };
        filteredShipments.forEach(s => s.approvedDraftDi === 'OK' ? groups['Approved'].push(s) : groups['Not Approved'].push(s));
        return Object.entries(groups).map(([label, shipments]) => ({ label, value: shipments.length, shipments, color: { 'Approved': '#10b981', 'Not Approved': '#ef4444' }[label] }));
    }, [filteredShipments]);
    
    const cargoVolumeDataStack = useMemo(() => {
        const months: { [key: string]: { [key: string]: { volume: number, shipments: Shipment[]} } } = {};
        const terminals = new Set<string>();
        const monthLabels = ['Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        monthLabels.forEach(m => (months[m] = {}));

        filteredShipments.forEach(s => {
            if (s.actualEta) {
                const date = new Date(s.actualEta);
                if (isNaN(date.getTime())) return;

                const monthIndex: number = date.getMonth(); // 0-11
                if (monthIndex >= 6) {
                    const monthName = monthLabels[monthIndex - 6];
                    const terminal = normalizeTerminalName(s.bondedWarehouse);
                    terminals.add(terminal);

                    let containerVolume = 0;
                    if (s.shipmentType === 'FCL' || s.shipmentType === 'FCL/LCL') {
                        containerVolume = s.fcl || 0;
                    }
                    if (containerVolume > 0) {
                        if (!months[monthName][terminal]) months[monthName][terminal] = { volume: 0, shipments: [] };
                        months[monthName][terminal].volume += containerVolume;
                        months[monthName][terminal].shipments.push(s);
                    }
                }
            }
        });

        const sortedTerminals = Array.from(terminals).sort();

        return {
            labels: monthLabels,
            datasets: sortedTerminals.map(terminal => ({
                label: terminal,
                data: monthLabels.map(m => months[m][terminal]?.volume || 0),
                terminals: monthLabels.map(() => terminal),
                shipments: monthLabels.map(m => months[m][terminal]?.shipments || []),
            })),
        };
    }, [filteredShipments]);


    return (
        <div className="cargos-in-transit-grid">
            <KPIFilterSidebar shipments={shipments} onFilterChange={onFilterChange} activeFilters={filters} />
            <main className="kpi-dashboard-main-grid">
                <div className="kpi-main-charts">
                    <DoughnutChart title="Shipments" data={shipmentsData} onSegmentClick={handleChartClick} />
                    <DoughnutChart title="Shipment Status" data={shipmentStatusData} onSegmentClick={handleChartClick} />
                    <DoughnutChart title="SAP PO Status" data={sapPoStatusData} onSegmentClick={handleChartClick} />
                    <DoughnutChart title="Document Status" data={docStatusData} onSegmentClick={handleChartClick} />
                </div>
                <VerticalBarChart title="Cargo Volume" data={cargoVolumeDataStack} onSegmentClick={handleChartClick} />
                {selectedShipments && (
                    <ShipmentsTable 
                        title={selectedShipments.title} 
                        shipments={selectedShipments.data} 
                        onClose={() => setSelectedShipments(null)} 
                    />
                )}
            </main>
        </div>
    );
}

const PerformanceDashboard = ({ shipments, onFilterChange, filters }: KPIPageProps) => {
    const [maximizedChart, setMaximizedChart] = useState(null);
    const [selectedShipments, setSelectedShipments] = useState<{title: string, data: Shipment[]} | null>(null);

    const handleChartClick = (title: string, shipments: Shipment[]) => {
        setSelectedShipments({ title: `Shipments for: ${title}`, data: shipments });
    };

    const filteredShipments = useMemo(() => {
        return shipments.filter(s => {
            const cargoMatch = !filters.cargo || filters.cargo.length === 0 || filters.cargo.includes(s.typeOfCargo);
            if (!s.diRegistrationDate) return false;
            const shipmentDate = new Date(s.diRegistrationDate);
            if (isNaN(shipmentDate.getTime())) return false;
            const yearMatch = filters.year === 'All' || shipmentDate.getFullYear() === filters.year;
            return cargoMatch && yearMatch;
        });
    }, [shipments, filters]);
    
    // Data for Doughnut charts
    const incotermData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = { 'DAP': [], 'CIF': [], 'FOB': [] };
        filteredShipments.forEach(s => {
            if (s.incoterm && groups.hasOwnProperty(s.incoterm)) {
                groups[s.incoterm].push(s);
            }
        });
        return Object.entries(groups).map(([label, shipments]) => ({ label, value: shipments.length, shipments, color: { 'DAP': '#a855f7', 'CIF': '#3b82f6', 'FOB': '#10b981' }[label] }));
    }, [filteredShipments]);

    const diParamData = useMemo(() => {
        const groups: { [key: string]: { uniqueDIs: Map<string, Shipment> } } = {
            'Green': { uniqueDIs: new Map() },
            'Yellow': { uniqueDIs: new Map() },
            'Red': { uniqueDIs: new Map() },
        };

        filteredShipments.forEach(s => {
            if (s.di && s.parametrization && groups.hasOwnProperty(s.parametrization)) {
                if (!groups[s.parametrization].uniqueDIs.has(s.di)) {
                    groups[s.parametrization].uniqueDIs.set(s.di, s);
                }
            }
        });

        return Object.entries(groups).map(([label, data]) => ({
            label,
            value: data.uniqueDIs.size,
            shipments: Array.from(data.uniqueDIs.values()),
            color: { 'Green': '#10b981', 'Yellow': '#facc15', 'Red': '#ef4444' }[label]
        }));
    }, [filteredShipments]);
    
    // Data for DIs Registers Chart
    const disPerMonth = useMemo(() => {
        const monthlyUniqueDIs = Array(12).fill(null).map(() => new Map<string, Shipment>());

        filteredShipments.forEach(shipment => {
            if (shipment.di && shipment.diRegistrationDate) {
                try {
                    const date = new Date(shipment.diRegistrationDate);
                    if (!isNaN(date.getTime())) {
                        const month = date.getMonth();
                        if (month >= 0 && month < 12) {
                            if (!monthlyUniqueDIs[month].has(shipment.di)) {
                                monthlyUniqueDIs[month].set(shipment.di, shipment);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Invalid date for DI Registration:", shipment.diRegistrationDate);
                }
            }
        });

        const monthlyCounts = monthlyUniqueDIs.map(s => s.size);
        const monthlyShipments = monthlyUniqueDIs.map(s => Array.from(s.values()));
        
        const labels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        return {
            labels: labels,
            datasets: [{
                label: 'DIs',
                data: monthlyCounts,
                shipments: monthlyShipments,
            }]
        };
    }, [filteredShipments]);

    // Data for Line Charts
    const lineChartData = useMemo(() => {
        const months = Array(12).fill(null).map(() => ({ 
            clearance: [], delivery: [], operation: [], nf: [],
            clearanceShipments: [], deliveryShipments: [], operationShipments: [], nfShipments: []
        }));
        
        const shipmentsForPerf = filteredShipments.filter(s => s.uniqueDi !== 'Yes');

        shipmentsForPerf.forEach(s => {
            if (s.diRegistrationDate) {
                const date = new Date(s.diRegistrationDate);
                if (isNaN(date.getTime())) return;
                const month = date.getMonth();
                if (month >= 0 && month < 12) {
                    const clearance = calculateDaysBetween(s.cargoPresenceDate, s.greenChannelOrDeliveryAuthorizedDate);
                    const delivery = calculateDaysBetween(s.greenChannelOrDeliveryAuthorizedDate, s.firstTruckDelivery);
                    const operation = calculateDaysBetween(s.actualEta, s.greenChannelOrDeliveryAuthorizedDate);
                    const nf = calculateDaysBetween(s.greenChannelOrDeliveryAuthorizedDate, s.nfIssueDate);

                    if (clearance !== null) { months[month].clearance.push(clearance); months[month].clearanceShipments.push(s); }
                    if (delivery !== null) { months[month].delivery.push(delivery); months[month].deliveryShipments.push(s); }
                    if (operation !== null) { months[month].operation.push(operation); months[month].operationShipments.push(s); }
                    if (nf !== null) { months[month].nf.push(nf); months[month].nfShipments.push(s); }
                }
            }
        });
        
        // FIX: Add types to avg function to prevent implicit any and ensure type safety
        const avg = (arr: number[]) => arr.length ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length : 0;
        
        const labels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        return {
            labels,
            clearance: months.map(m => ({ value: Math.round(avg(m.clearance)), shipments: m.clearanceShipments })),
            delivery: months.map(m => ({ value: Math.round(avg(m.delivery)), shipments: m.deliveryShipments })),
            operation: months.map(m => ({ value: Math.round(avg(m.operation)), shipments: m.operationShipments })),
            nf: months.map(m => ({ value: Math.round(avg(m.nf)), shipments: m.nfShipments })),
        };

    }, [filteredShipments]);

    const chartProps = {
        clearance: { title: "Clearance Time", subtitle: "Business Days - Goal: 5", data: lineChartData.clearance, labels: lineChartData.labels, goal: 5, color: "var(--kpi-accent-cyan)" },
        delivery: { title: "Delivery Time", subtitle: "Business Days - Goal: 3", data: lineChartData.delivery, labels: lineChartData.labels, goal: 3, color: "var(--kpi-accent-green)" },
        operation: { title: "Operation Time", subtitle: "Business Days - Goal: 8", data: lineChartData.operation, labels: lineChartData.labels, goal: 8, color: "var(--kpi-accent-blue)" },
        nf: { title: "NF Issue Time", subtitle: "Business Days - Goal: 6", data: lineChartData.nf, labels: lineChartData.labels, goal: 6, color: "var(--kpi-accent-purple)" },
    };

    return (
        <div className="performance-grid">
            <KPIFilterSidebar shipments={shipments} onFilterChange={onFilterChange} activeFilters={filters} dateSourceField="diRegistrationDate" />
            <main className="performance-main">
                <div className="performance-top-row">
                    <DoughnutChart title="Incoterm" data={incotermData} onSegmentClick={handleChartClick} />
                    <VerticalBarChart title="DIs Registers" data={disPerMonth} onSegmentClick={handleChartClick} />
                    <DoughnutChart title="DI Parameterization" data={diParamData} strokeWidth={20} onSegmentClick={handleChartClick} />
                </div>
                <div className="performance-bottom-row">
                    <LineChart {...chartProps.clearance} onMaximize={() => setMaximizedChart(chartProps.clearance)} onPointClick={handleChartClick} />
                    <LineChart {...chartProps.delivery} onMaximize={() => setMaximizedChart(chartProps.delivery)} onPointClick={handleChartClick} />
                    <LineChart {...chartProps.operation} onMaximize={() => setMaximizedChart(chartProps.operation)} onPointClick={handleChartClick} />
                    <LineChart {...chartProps.nf} onMaximize={() => setMaximizedChart(chartProps.nf)} onPointClick={handleChartClick} />
                </div>
                 {selectedShipments && (
                    <ShipmentsTable 
                        title={selectedShipments.title} 
                        shipments={selectedShipments.data} 
                        onClose={() => setSelectedShipments(null)} 
                    />
                )}
            </main>
            {maximizedChart && (
                <div className="chart-modal-backdrop" onClick={() => setMaximizedChart(null)}>
                    <div className="chart-modal-content" onClick={e => e.stopPropagation()}>
                        <LineChart {...maximizedChart} />
                    </div>
                </div>
            )}
        </div>
    );
}

const OperationStatusDashboard = ({ shipments, onFilterChange, filters }: KPIPageProps) => {
    const [selectedShipments, setSelectedShipments] = useState<{title: string, data: Shipment[]} | null>(null);

    const handleChartClick = (title: string, shipments: Shipment[]) => {
        setSelectedShipments({ title: `Shipments for: ${title}`, data: shipments });
    };

    const filteredShipments = useMemo(() => {
        return shipments.filter(s => {
            const cargoMatch = !filters.cargo || filters.cargo.length === 0 || filters.cargo.includes(s.typeOfCargo);
            if (!s.actualEta) return false;
            const shipmentDate = new Date(s.actualEta);
            if (isNaN(shipmentDate.getTime())) return false;
            const yearMatch = filters.year === 'All' || shipmentDate.getFullYear() === filters.year;
            return cargoMatch && yearMatch;
        });
    }, [shipments, filters]);

    const statusByBLsData = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = {
            'IN TRANSIT': [], 'AT THE PORT': [], 'DI REGISTERED': [], 'CARGO CLEARED': []
        };
        filteredShipments.forEach(s => {
            if (s.status && groups.hasOwnProperty(s.status)) {
                groups[s.status].push(s);
            }
        });
        return Object.entries(groups).map(([label, shipments]) => ({
            label, value: shipments.length, shipments,
            color: { 'IN TRANSIT': '#3b82f6', 'AT THE PORT': '#f97316', 'DI REGISTERED': '#facc15', 'CARGO CLEARED': '#10b981' }[label]
        }));
    }, [filteredShipments]);

    const statusByContainersData = useMemo(() => {
        const groups: { [key: string]: { shipments: Shipment[], count: number } } = {
            'IN TRANSIT': {shipments: [], count: 0}, 'AT THE PORT': {shipments: [], count: 0}, 
            'DI REGISTERED': {shipments: [], count: 0}, 'CARGO CLEARED': {shipments: [], count: 0}
        };
        filteredShipments.forEach(s => {
            if (s.status && groups.hasOwnProperty(s.status)) {
                const containerCount = (s.shipmentType === 'FCL' || s.shipmentType === 'FCL/LCL') ? (s.fcl || 1) : 0;
                groups[s.status].count += containerCount;
                groups[s.status].shipments.push(s);
            }
        });
        return Object.entries(groups).map(([label, data]) => ({
            label, value: Math.round(data.count), shipments: data.shipments,
            color: { 'IN TRANSIT': '#3b82f6', 'AT THE PORT': '#f97316', 'DI REGISTERED': '#facc15', 'CARGO CLEARED': '#10b981' }[label]
        }));
    }, [filteredShipments]);
    
    const cargoValueByWarehouseData = useMemo(() => {
        const warehouses: { [key: string]: { shipments: Shipment[], total: number } } = {};
        filteredShipments.forEach(s => {
            const warehouse = normalizeTerminalName(s.bondedWarehouse);
            if (warehouse !== 'N/A') {
                if (!warehouses[warehouse]) warehouses[warehouse] = { shipments: [], total: 0 };
                warehouses[warehouse].total += (s.invoiceValue || 0);
                warehouses[warehouse].shipments.push(s);
            }
        });
        return Object.entries(warehouses).map(([label, data]) => ({ label, value: data.total, shipments: data.shipments }));
    }, [filteredShipments]);
    
    const containerVolumeByWarehouseData = useMemo(() => {
         const warehouses: { [key: string]: { shipments: Shipment[], total: number } } = {};
        filteredShipments.forEach(s => {
            const warehouse = normalizeTerminalName(s.bondedWarehouse);
            if (warehouse !== 'N/A') {
                if (!warehouses[warehouse]) warehouses[warehouse] = { shipments: [], total: 0 };
                const containerCount = (s.shipmentType === 'FCL' || s.shipmentType === 'FCL/LCL') ? (s.fcl || 1) : 0;
                warehouses[warehouse].total += containerCount;
                warehouses[warehouse].shipments.push(s);
            }
        });
        return Object.entries(warehouses).map(([label, data]) => ({ label, value: data.total, shipments: data.shipments }));
    }, [filteredShipments]);
    

    return (
        <div className="operation-status-grid">
            <KPIFilterSidebar shipments={shipments} onFilterChange={onFilterChange} activeFilters={filters} />
            <main className="operation-status-main">
                <div className="operation-charts-column">
                    <DoughnutChart title="Shipment Status (by BLs)" data={statusByBLsData} onSegmentClick={handleChartClick} />
                    <DoughnutChart title="Shipment Status (by Containers)" data={statusByContainersData} onSegmentClick={handleChartClick} />
                </div>
                <div className="operation-charts-column">
                     <HorizontalBarChart title="Cargo Value" data={cargoValueByWarehouseData} colorMap={TERMINAL_COLOR_MAP} onBarClick={handleChartClick} />
                     <HorizontalBarChart title="Container Volume" data={containerVolumeByWarehouseData} colorMap={TERMINAL_COLOR_MAP} onBarClick={handleChartClick} />
                </div>
                {selectedShipments && (
                    <div className="operation-charts-column" style={{gridColumn: '1 / -1'}}>
                        <ShipmentsTable 
                            title={selectedShipments.title} 
                            shipments={selectedShipments.data} 
                            onClose={() => setSelectedShipments(null)} 
                        />
                    </div>
                )}
            </main>
        </div>
    );
};


const KPIsPage = ({ shipments }: { shipments: Shipment[] }) => {
    const [activeTab, setActiveTab] = useState('Cargos in Transit');
    
    const latestYear = useMemo(() => {
        const years = shipments
            .map(s => {
                if (!s.actualEta) return null;
                const date = new Date(s.actualEta);
                return isNaN(date.getTime()) ? null : date.getFullYear();
            })
            .filter(y => y && !isNaN(y)) as number[];
        return years.length > 0 ? Math.max(...years) : new Date().getFullYear();
    }, [shipments]);

    const [filters, setFilters] = useState<KpiFilters>({ cargo: [], year: latestYear });
    
    useEffect(() => {
        setFilters(f => ({ ...f, year: latestYear }));
    }, [latestYear]);

    const handleFilterChange = (filterType, value) => {
        setFilters(prev => ({ ...prev, [filterType]: value }));
    };

    const renderActiveDashboard = () => {
        switch (activeTab) {
            case 'Cargos in Transit':
                return <CargosInTransitDashboard shipments={shipments} onFilterChange={handleFilterChange} filters={filters} />;
            case 'Performance':
                return <PerformanceDashboard shipments={shipments} onFilterChange={handleFilterChange} filters={filters} />;
            case 'Operation Status':
                return <OperationStatusDashboard shipments={shipments} onFilterChange={handleFilterChange} filters={filters} />;
            default:
                return null;
        }
    };

    return (
        <div className="kpis-page">
            <header className="kpi-dashboard-header">
                <div className="kpi-dashboard-title">
                     <h1>INTERNATIONAL TRADE - DIVISION 11</h1>
                     <h2>{activeTab.toUpperCase()}</h2>
                </div>
                <div className="kpi-dashboard-flags">
                    <img src="https://flagcdn.com/cn.svg" alt="China Flag" style={{ height: '40px' }} />
                    <img src="https://flagcdn.com/br.svg" alt="Brazil Flag" style={{ height: '40px' }} />
                </div>
            </header>
            <nav className="kpi-tabs">
                <button className={activeTab === 'Cargos in Transit' ? 'active' : ''} onClick={() => setActiveTab('Cargos in Transit')}>Cargos in Transit</button>
                <button className={activeTab === 'Performance' ? 'active' : ''} onClick={() => setActiveTab('Performance')}>Performance</button>
                <button className={activeTab === 'Operation Status' ? 'active' : ''} onClick={() => setActiveTab('Operation Status')}>Operation Status</button>
            </nav>
            <div className="kpi-content">
                {renderActiveDashboard()}
            </div>
        </div>
    );
};




// FIX: Add explicit type for the 'shipments' prop to fix cascading type errors.
// When 'shipments' is implicitly 'any', derived variables inside this component
// also become 'any' or 'unknown', leading to errors in arithmetic operations
// and when rendering data in child components.
const BrokerageKPIsPage = ({ shipments }: { shipments: Shipment[] }) => {
  const [filters, setFilters] = useState({
    analyst: 'All',
    month: 'All',
    year: new Date().getFullYear().toString(),
    cargo: 'All'
  });
  const [selectedShipments, setSelectedShipments] = useState<{title: string, data: Shipment[]} | null>(null);

  const handleChartClick = (title: string, shipments: Shipment[]) => {
      setSelectedShipments({ title: `Shipments for: ${title}`, data: shipments });
  };

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const filteredShipments = useMemo(() => {
    const toTitleCase = (str: string | undefined): string => {
        if (!str) return '';
        return str.replace(
            /\w\S*/g,
            (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    };

    return shipments.filter(s => {
      const shipDate = s.diRegistrationDate ? new Date(s.diRegistrationDate) : null;
      if (!shipDate || isNaN(shipDate.getTime())) return false;
      const yearMatch = filters.year === 'All' || shipDate.getFullYear().toString() === filters.year;
      const monthMatch = filters.month === 'All' || (shipDate.getMonth() + 1).toString() === filters.month;
      const analystMatch = filters.analyst === 'All' || toTitleCase(s.technicianResponsibleBrazil) === filters.analyst;
      const cargoMatch = filters.cargo === 'All' || s.typeOfCargo === filters.cargo;
      return yearMatch && monthMatch && analystMatch && cargoMatch;
    });
  }, [shipments, filters]);

  const kpiMetrics = useMemo(() => {
    const totalDIs = new Set(filteredShipments.map(s => s.di).filter(Boolean)).size;
// FIX: Explicitly type reduce function arguments to prevent type inference issues.
    const totalValue = filteredShipments.reduce((sum: number, s) => sum + (s.invoiceValue || 0), 0);
    
    const clearanceTimes = filteredShipments
        .map(s => calculateDaysBetween(s.cargoPresenceDate, s.greenChannelOrDeliveryAuthorizedDate))
        .filter((days): days is number => days !== null);
    
// FIX: Explicitly type reduce function arguments to prevent type inference issues.
    const totalClearanceTime = clearanceTimes.reduce((sum: number, days: number) => sum + days, 0);
    const avgClearance = clearanceTimes.length > 0 ? totalClearanceTime / clearanceTimes.length : 0;
    
    const analystCount = new Set(filteredShipments.map(s => s.technicianResponsibleBrazil).filter(Boolean)).size;
    const dIsPerAnalyst = analystCount > 0 ? totalDIs / analystCount : totalDIs;

    return {
        totalDIs,
        totalValue,
        avgClearance: avgClearance.toFixed(1),
        dIsPerAnalyst
    };
  }, [filteredShipments]);
  
    const volumeByTransport = useMemo(() => {
        const groups: { [key: string]: Shipment[] } = {};
        filteredShipments.forEach(s => {
            const type = s.shipmentType || 'Unknown';
            if (!groups[type]) groups[type] = [];
            groups[type].push(s);
        });
        return Object.entries(groups).map(([label, shipments]: [string, Shipment[]]) => ({ label, value: shipments.length, shipments }));
    }, [filteredShipments]);
    
    const avgTimeByIncoterm = useMemo(() => {
        const groups: { [key: string]: { total: number; count: number, shipments: Shipment[] } } = {};
        filteredShipments.forEach(s => {
            if (s.incoterm) {
                const days = calculateDaysBetween(s.actualEtd, s.actualEta);
                if (days !== null) {
                    if (!groups[s.incoterm]) groups[s.incoterm] = { total: 0, count: 0, shipments: [] };
                    groups[s.incoterm].total += days;
                    groups[s.incoterm].count++;
                    groups[s.incoterm].shipments.push(s);
                }
            }
        });
        return Object.entries(groups).map(([label, data]: [string, { total: number, count: number, shipments: Shipment[] }]) => ({ 
            label, 
            value: Math.round(data.total / data.count),
            shipments: data.shipments
        }));
    }, [filteredShipments]);
    
    const diChannelData = useMemo(() => {
        const groups: { [key: string]: { shipments: Shipment[], uniqueDIs: Set<string> } } = {
            'Green': { shipments: [], uniqueDIs: new Set() },
            'Yellow': { shipments: [], uniqueDIs: new Set() },
            'Red': { shipments: [], uniqueDIs: new Set() }
        };

        filteredShipments.forEach(s => {
            if (s.parametrization && groups.hasOwnProperty(s.parametrization)) {
                const group = groups[s.parametrization as keyof typeof groups];
                group.shipments.push(s);
                if (s.di) {
                    group.uniqueDIs.add(s.di);
                }
            }
        });

        return Object.entries(groups).map(([label, data]) => ({
            label,
            value: data.shipments.length,
            secondaryValue: data.uniqueDIs.size,
            shipments: data.shipments,
            color: { 'Green': '#28a745', 'Yellow': '#ffc107', 'Red': '#dc3545' }[label as 'Green' | 'Yellow' | 'Red']
        }));
    }, [filteredShipments]);


  return (
    <div className="brokerage-kpi-page">
      <div className="kpi-content">
        <header className="kpi-page-header">
            <h1>Brokerage KPIs</h1>
            <h2>Performance metrics for brokerage operations</h2>
        </header>

        <BrokerageKPIFilter shipments={shipments} activeFilters={filters} onFilterChange={handleFilterChange} />

         {/* This is where your new layout starts */}
        <section className="kpi-section">
            <h3 className="kpi-section-title">Productivity & Volume</h3>
            <div className="kpi-grid-4">
                <KPIMetricCard icon={<ReceiptIcon />} title="Total DIs Registered" value={kpiMetrics.totalDIs} />
                <KPIMetricCard icon={<UserIcon />} title="DIs per Analyst" value={kpiMetrics.dIsPerAnalyst.toFixed(1)} />
                <div className="chart-wrapper-full">
                    <HorizontalBarChart title="Volume by Transport Modal" data={volumeByTransport} onBarClick={handleChartClick} colorMap={{'FCL': '#007bff', 'LCL': '#28a745', 'AIR': '#17a2b8', 'FCL/LCL': '#6f42c1', 'RO-RO': '#fd7e14'}} />
                </div>
            </div>
        </section>

        <section className="kpi-section">
            <h3 className="kpi-section-title">Efficiency & Cycle Time</h3>
             <div className="performance-content-grid">
                <KPIMetricCard icon={<CalendarIcon/>} title="Avg. Clearance Time" value={`${kpiMetrics.avgClearance} days`} />
                <div className="chart-wrapper-full">
                     <HorizontalBarChart title="Avg. Transit Time by Incoterm" data={avgTimeByIncoterm} onBarClick={handleChartClick} colorMap={{'FOB': '#007bff', 'CIF': '#28a745', 'DAP': '#ffc107', 'EXW': '#dc3545'}} />
                </div>
            </div>
        </section>
        
         <section className="kpi-section">
            <h3 className="kpi-section-title">Quality & Risk Management</h3>
            <div className="performance-content-grid">
                 <div className="chart-wrapper-full">
                    <DoughnutChart title="DI Channel Parameterization" data={diChannelData} onSegmentClick={handleChartClick} strokeWidth={15} size={150} />
                 </div>
                 {/* Another chart can go here */}
            </div>
        </section>
        {selectedShipments && (
            <ShipmentsTable 
                title={selectedShipments.title} 
                shipments={selectedShipments.data} 
                onClose={() => setSelectedShipments(null)} 
            />
        )}
      </div>
    </div>
  );
};
const KPIMetricCard = ({ icon, title, value }) => (
    <div className="kpi-metric-card">
        <div className="kpi-metric-icon">{icon}</div>
        <div className="kpi-metric-info">
            <h4 className="kpi-metric-title">{title}</h4>
            <p className="kpi-metric-value">{value}</p>
        </div>
    </div>
);

const BrokerageKPIFilter = ({ shipments, activeFilters, onFilterChange }) => {
    const analysts = useMemo(() => {
        const toTitleCase = (str: string): string => {
            if (!str) return '';
            return str.replace(
                /\w\S*/g,
                (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
            );
        };

        const analystSet = new Set(
            shipments
                .map(s => s.technicianResponsibleBrazil)
                .filter((name): name is string => !!name)
                .map(name => toTitleCase(name))
        );
        return Array.from(analystSet).sort();
    }, [shipments]);

    const years = useMemo(() => {
        const yearSet = new Set(
            shipments
                .map(s => {
                    if (!s.diRegistrationDate) return null;
                    const date = new Date(s.diRegistrationDate);
                    return isNaN(date.getTime()) ? null : date.getFullYear();
                })
                .filter(y => y && !isNaN(y))
        );
        return Array.from(yearSet).sort((a, b) => b - a);
    }, [shipments]);

    const months = [
        { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
        { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
        { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
        { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
    ];
    
    const cargoTypes = useMemo(() => {
        const types = new Set(shipments.map(s => s.typeOfCargo).filter(Boolean));
        return Array.from(types).sort();
    }, [shipments]);

    return (
        <div className="kpi-filters-bar">
            <div className="kpi-filter-group">
                <label htmlFor="year-filter">Year</label>
                <select id="year-filter" value={activeFilters.year} onChange={e => onFilterChange('year', e.target.value)}>
                    <option value="All">All Years</option>
                    {years.map(year => <option key={year} value={String(year)}>{year}</option>)}
                </select>
            </div>
            <div className="kpi-filter-group">
                <label htmlFor="month-filter">Month</label>
                <select id="month-filter" value={activeFilters.month} onChange={e => onFilterChange('month', e.target.value)}>
                    <option value="All">All Months</option>
                    {months.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
                </select>
            </div>
            <div className="kpi-filter-group">
                <label htmlFor="analyst-filter">Analyst</label>
                <select id="analyst-filter" value={activeFilters.analyst} onChange={e => onFilterChange('analyst', e.target.value)}>
                    <option value="All">All Analysts</option>
                    {analysts.map(analyst => <option key={analyst} value={analyst}>{analyst}</option>)}
                </select>
            </div>
            <div className="kpi-filter-group">
                <label htmlFor="cargo-filter">Cargo</label>
                <select id="cargo-filter" value={activeFilters.cargo} onChange={e => onFilterChange('cargo', e.target.value)}>
                    <option value="All">All Cargos</option>
                    {cargoTypes.map(cargo => <option key={cargo} value={cargo}>{cargo}</option>)}
                </select>
            </div>
        </div>
    );
};


const ImportsPage = ({ shipments, isLoading, error, onUpload, initialFilters }) => {
    // ... Implementation for Imports Page, which includes table, filtering, upload modal, etc.
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploadModalOpen, setUploadModalOpen] = useState(false);
    
    const [statusFilter, setStatusFilter] = useState(initialFilters?.statusFilter || 'All');

    useEffect(() => {
        if (initialFilters?.statusFilter) {
            setStatusFilter(initialFilters.statusFilter);
        }
    }, [initialFilters]);

    const filteredShipments = useMemo(() => {
        return shipments.filter(s => {
            const matchesSearch = searchTerm === '' ||
                s.blAwb?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.description?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'All' || s.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [shipments, searchTerm, statusFilter]);

    return (
        <div>
            <div className="page-header">
                <ImportsIcon />
                <h1>Imports</h1>
            </div>
            <p className="page-subtitle">Track and manage all incoming shipments.</p>
            
            <div className="actions-bar">
                <input
                    type="text"
                    placeholder="Search by BL, Description..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                 <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                    <option value="All">All Statuses</option>
                    {Object.values(ImportStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="upload-btn" onClick={() => setUploadModalOpen(true)}>
                    <UploadIcon />
                    <span>Upload Sheet</span>
                </button>
            </div>

            {isLoading && <LoadingSpinner />}
            {error && <div className="error-banner">{error}</div>}

            <div className="table-container">
                <table className="shipments-table">
                    <thead>
                        <tr>
                            <th>BL/AWB</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th>ETA</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredShipments.map(s => (
                            <tr key={s.id}>
                                <td>{s.blAwb}</td>
                                <td>{s.typeOfCargo}</td>
                                {/* FIX: Replaced template literal with string concatenation to work around a parser issue and fixed a potential runtime error. */}
                                <td><span className={'status-badge status-' + (s.status ? s.status.replace(/\s+/g, '-').toLowerCase() : '')}>{s.status}</span></td>
                                <td>{formatDate(s.actualEta)}</td>
                                <td><button className="details-btn">Details</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
             <UploadModal isOpen={isUploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={onUpload} />
        </div>
    );
};


// FIX: Defined props with an interface for better type safety and to resolve a misleading error about a missing 'children' property caused by type inference issues.
interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (shipments: Shipment[]) => Promise<void>;
}

// FIX: Type the component as a React.FC to resolve issues with TypeScript inferring a required 'children' prop.
const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUpload }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError('');
    setSuccess('');
  };

  const handleUpload = () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    setIsUploading(true);
    setError('');
    setSuccess('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Assuming headers are in the first row
        const headers = json[0] as string[];
        const rows = json.slice(1);

        const shipmentsToUpload = rows.map((rowArray, index) => {
            const row = rowArray as any[];
            let shipment: Partial<Shipment> = { id: `row-${index}` }; // Temp ID
            headers.forEach((header, i) => {
                const key = header.toLowerCase().replace(/\s+/g, '');
                const value = row[i];
                // You will need a comprehensive mapping here
                // This is a simplified example
                if (key.includes('bl')) shipment.blAwb = value;
                if (key.includes('description') || key.includes('cargo')) shipment.typeOfCargo = value;
                if (key.includes('costcenter')) shipment.costCenter = value;
                if (key.includes('status')) shipment.status = value;
                if (key.includes('eta')) shipment.actualEta = parseDateFromExcel(value);
                if (key.includes('etd')) shipment.actualEtd = parseDateFromExcel(value);
                if (key.includes('incoterm')) shipment.incoterm = value;
                if (key.includes('posap')) shipment.poSap = value;
                if (key.includes('approveddraftdi')) shipment.approvedDraftDi = value;
                if (key.includes('bondedwarehouse')) shipment.bondedWarehouse = value;
                if (key.includes('fcl')) shipment.fcl = typeof value === 'number' ? value : 0;
                if (key.includes('invoicevalue')) shipment.invoiceValue = typeof value === 'number' ? value : 0;
                if (key.includes('parametrization')) shipment.parametrization = value;
                if (key.includes('cargopresence')) shipment.cargoPresenceDate = parseDateFromExcel(value);
                if (key.includes('diregistration')) shipment.diRegistrationDate = parseDateFromExcel(value);
                if (key.includes('greenchannel') || key.includes('deliveryauthorized')) shipment.greenChannelOrDeliveryAuthorizedDate = parseDateFromExcel(value);
                if (key.includes('firsttruck')) shipment.firstTruckDelivery = parseDateFromExcel(value);
                if (key.includes('lasttruck')) shipment.lastTruckDelivery = parseDateFromExcel(value);
                if (key.includes('nfissue')) shipment.nfIssueDate = parseDateFromExcel(value);
                if (key.includes('di') && !key.includes('registration') && !key.includes('draft') && !key.includes('cif')) shipment.di = value;
                if (key.includes('uniquedi')) shipment.uniqueDi = value;

            });
            return shipment as Shipment;
        }).filter(s => s.blAwb); // Only include shipments with a BL

        await onUpload(shipmentsToUpload);

        setSuccess(`${shipmentsToUpload.length} shipments processed successfully!`);
        setFile(null);

      } catch (err) {
        console.error(err);
        setError('Failed to process the Excel file. Please check the format.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
   const resetState = () => {
        setFile(null);
        setIsUploading(false);
        setError('');
        setSuccess('');
    };

    const handleClose = () => {
        resetState();
        onClose();
    };


  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
        <div className="modal-header">
            <h3>Upload Shipments</h3>
            <button onClick={handleClose}><CloseIcon/></button>
        </div>
        <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            {success && <div className="success-banner">{success}</div>}
            
            <div className="file-drop-area"
                onClick={() => fileInputRef.current.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
            >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" style={{ display: 'none' }} />
                {file ? (
                    <p>Selected file: {file.name}</p>
                ) : (
                    <>
                        <UploadIcon />
                        <p>Drag & drop your Excel file here, or click to select.</p>
                    </>
                )}
            </div>
        </div>
        <div className="modal-actions-footer">
            <button className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button className="btn-primary" onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading ? <LoadingSpinner/> : 'Upload'}
            </button>
        </div>
    </Modal>
  );
};

const ShipmentsTable = ({ title, shipments, onClose }) => (
    <div className="shipments-table-container-inline">
        <div className="shipments-table-header">
            <h3>{title}</h3>
            <button onClick={onClose} className="close-table-btn" aria-label="Close table">
                <CloseIcon />
            </button>
        </div>
        <div className="shipments-table-body">
            <table className="shipments-table modal-table">
                <thead>
                    <tr>
                        <th>BL/AWB</th>
                        <th>Type of Cargo</th>
                        <th>Status</th>
                        <th>ETA</th>
                    </tr>
                </thead>
                <tbody>
                    {shipments.length > 0 ? (
                        shipments.map(s => (
                            <tr key={s.id || s.blAwb}>
                                <td>{s.blAwb}</td>
                                <td>{s.typeOfCargo}</td>
                                {/* FIX: Replaced template literal with string concatenation to work around a parser issue and fixed a potential runtime error. */}
                                <td><span className={'status-badge status-' + (s.status ? s.status.replace(/\s+/g, '-').toLowerCase() : '')}>{s.status}</span></td>
                                <td>{formatDate(s.actualEta)}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>No shipments to display.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);


const App = () => {
    const [user, setUser] = useState<firebase.User | null>(null);
    const [userData, setUserData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    
    // Page state
    const [activePage, setActivePage] = useState('Dashboard');
    const [pageState, setPageState] = useState({});

    // Data state
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState('');

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const userDoc = await firestore.collection('users').doc(firebaseUser.uid).get();
                if (userDoc.exists) {
                    setUserData(userDoc.data() as User);
                } else {
                    // Handle case where user exists in Auth but not Firestore
                    setUserData({ id: firebaseUser.uid, name: firebaseUser.displayName || 'New User', username: firebaseUser.email || '', role: 'COMEX' });
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Fetch Shipments Data
    useEffect(() => {
        const fetchShipments = async () => {
            if (!user) return;
            setDataLoading(true);
            setDataError('');
            try {
                const snapshot = await firestore.collection('shipments').get();
                const shipmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Shipment[];
                setShipments(shipmentsData);
            } catch (err) {
                console.error("Error fetching shipments:", err);
                setDataError('Failed to load shipment data.');
            } finally {
                setDataLoading(false);
            }
        };
        fetchShipments();
    }, [user]);

    const handleUploadShipments = async (newShipments: Shipment[]) => {
        const batch = firestore.batch();
        
        newShipments.forEach(shipment => {
            // Use BL/AWB as a unique identifier to upsert
            const docRef = firestore.collection('shipments').doc(shipment.blAwb.replace(/\//g, '-'));
            batch.set(docRef, shipment, { merge: true });
        });

        await batch.commit();

        // Refresh data from Firestore to get the latest state
        const snapshot = await firestore.collection('shipments').get();
        const shipmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Shipment[];
        setShipments(shipmentsData);
    };
    
    const handleNavigate = (page: string, state: object = {}) => {
        setActivePage(page);
        setPageState(state);
    }

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (!user) {
        return <LoginPage onLoginSuccess={() => {}} />;
    }

    const renderPage = () => {
        switch (activePage) {
            case 'Dashboard':
                return <DashboardPage shipments={shipments} onNavigate={handleNavigate}/>;
            case 'Imports':
                return <ImportsPage shipments={shipments} isLoading={dataLoading} error={dataError} onUpload={handleUploadShipments} initialFilters={pageState} />;
            case 'KPIs':
                return <KPIsPage shipments={shipments} />;
            case 'Brokerage KPIs':
                return <BrokerageKPIsPage shipments={shipments} />;
            default:
                return <div>Page not found</div>;
        }
    };
    
    const navItems = [
        { name: 'Dashboard', icon: DashboardIcon },
        { name: 'Imports', icon: ImportsIcon },
        { name: 'KPIs', icon: KPIsIcon },
        { name: 'Brokerage KPIs', icon: ReportIcon },
    ];

    return (
        <div className={'app-container ' + (isSidebarCollapsed ? 'sidebar-collapsed' : '')}>
             <aside className={'sidebar ' + (isSidebarCollapsed ? 'collapsed' : '')}>
                <div>
                    <header className="sidebar-header">
                        <span>Navigator</span>
                         {!isSidebarCollapsed && (
                             <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(true)} aria-label="Collapse sidebar">
                                <ToggleCollapsedIcon />
                            </button>
                         )}
                    </header>
                    <nav>
                        <ul className="nav-links">
                            {navItems.map(item => (
                                <li key={item.name}>
                                    <a
                                        href="#"
                                        className={'nav-link ' + (activePage === item.name ? 'active' : '')}
                                        onClick={(e) => { e.preventDefault(); handleNavigate(item.name); }}
                                        title={item.name}
                                    >
                                        <item.icon />
                                        <span className="nav-label">{item.name}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
                <footer className="sidebar-footer">
                     {isSidebarCollapsed ? (
                        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(false)} aria-label="Expand sidebar">
                            <ToggleExpandedIcon />
                        </button>
                    ) : (
                        <>
                            <div className="user-info">
                                <UserIcon />
                                <div className="user-details">
                                    <span className="user-name">{userData?.name}</span>
                                    <span className="user-role">{userData?.role}</span>
                                </div>
                            </div>
                            <a href="#" className="nav-link logout-btn" onClick={() => auth.signOut()}>
                                <LogoutIcon />
                                <span className="nav-label">Logout</span>
                            </a>
                        </>
                    )}
                </footer>
            </aside>
            <main className="main-content">
                {renderPage()}
            </main>
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);