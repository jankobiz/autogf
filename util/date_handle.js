function dateDiffInDaysCeil(date1, date2) {
    let _MS_PER_DAY = 1000 * 60 * 60 * 24;

    let timestamp1 = date1.getTime();
    let timestamp2 = date2.getTime();
    return Math.ceil((timestamp2 - timestamp1) / _MS_PER_DAY);
}

function dateDiffInDaysFloor(date1, date2) {
    let _MS_PER_DAY = 1000 * 60 * 60 * 24;

    let timestamp1 = date1.getTime();
    let timestamp2 = date2.getTime();
    return Math.floor((timestamp2 - timestamp1) / _MS_PER_DAY);
}

function dateDiffInDaysUTC(date1, date2) {
    let _MS_PER_DAY = 1000 * 60 * 60 * 24;

    // Discard the time and time-zone information.
    let utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    let utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

function dateToUTC() {

}

module.exports = {
    dateDiffInDaysUTC: dateDiffInDaysUTC,
    dateDiffInDaysCeil: dateDiffInDaysCeil,
    dateDiffInDaysFloor: dateDiffInDaysFloor
}